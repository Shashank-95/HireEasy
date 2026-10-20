import 'server-only'
import { db } from '../supabase/server'
import type { RoleSpec } from '../templates/types'
import type { CandidateRow } from '../data/candidates'
import { recordDecision } from '../data/candidates'
import { askJson, geminiChain, hasGemini, scoringChain } from '../ai/providers'
import { buildResumePrompt, checkResumeOutput, computeExperience, RESUME_SYSTEM, ResumeOutput, repairResumeOutput } from '../ai/resume'
import { downloadResume, extractResumeText, ResumeError } from '../resume/fetch'
import { redactIdentity } from '../eligibility/redact'
import { matchPreferredColleges } from '../colleges'
import { toPct } from './scoring'

const MIN_TEXT = 200

/** Scanned PDFs have no text layer; Gemini can read the page images directly. */
async function readScannedPdf(bytes: Uint8Array): Promise<string> {
  if (!hasGemini()) return ''
  // Plain transcription, not scoring: any model in the chain will do
  for (const model of geminiChain()) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY! },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ inline_data: { mime_type: 'application/pdf', data: Buffer.from(bytes).toString('base64') } }, { text: 'Transcribe all text in this resume exactly, as plain text. No commentary.' }] }],
        generationConfig: { temperature: 0 },
      }),
    })
    if (res.status === 429 || res.status === 503) continue
    if (!res.ok) return ''
    const data = await res.json()
    return (data.candidates?.[0]?.content?.parts ?? []).map((p: { text?: string }) => p.text ?? '').join('')
  }
  return ''
}

/**
 * Read one candidate's resume: download, store, extract text, score the
 * resume-assessed skills, and verify open-ended experience claims. A resume
 * that can't be read never stalls the pipeline: the candidate continues on
 * their answers alone, with a flag for a person to check.
 */
export async function resumeCandidate(roleId: string, version: number, spec: RoleSpec, c: CandidateRow) {
  const link = c.fields.resume?.trim()
  const flags = [...(c.parsed.flags ?? [])]
  let text = ''
  let failure: string | null = null

  // A re-run replaces the earlier record instead of piling up duplicates
  await db().from('documents').delete().eq('candidate_id', c.id).eq('kind', 'resume')

  if (!link) failure = 'No resume link in the application.'
  else {
    try {
      const file = await downloadResume(link)
      const path = `${roleId}/${c.id}.${file.kind}`
      await db().storage.from('resumes').upload(path, file.bytes, { upsert: true, contentType: file.kind === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
      text = await extractResumeText(file.bytes, file.kind)
      if (text.replace(/\s+/g, '').length < MIN_TEXT && file.kind === 'pdf') text = await readScannedPdf(file.bytes)
      if (text.replace(/\s+/g, '').length < MIN_TEXT) failure = 'The resume has almost no readable text (it may be an image).'
      await db().from('documents').insert({ candidate_id: c.id, kind: 'resume', source_url: link, storage_path: path, text_content: text.slice(0, 60_000), sha256: file.sha256, status: failure ? 'failed' : 'stored', error: failure })
    } catch (e) {
      failure = e instanceof ResumeError ? e.message : 'The resume could not be downloaded.'
      await db().from('documents').insert({ candidate_id: c.id, kind: 'resume', source_url: link, status: 'failed', error: failure })
    }
  }

  if (failure) {
    flags.push(`Resume not read: ${failure}`)
    await db().from('evaluations').insert({ candidate_id: c.id, stage: 'resume', actor_type: 'system', role_version: version, details: { failed: failure } })
    await db().from('candidates').update({ parsed: { ...c.parsed, flags }, updated_at: new Date().toISOString() }).eq('id', c.id)
    return
  }

  const redacted = redactIdentity(text, { name: c.name })
  const r = await askJson({ model: scoringChain(), system: RESUME_SYSTEM, user: buildResumePrompt(spec, redacted), schema: ResumeOutput, extraCheck: v => checkResumeOutput(v, spec, redacted), repairLastTry: v => repairResumeOutput(v, spec, redacted) })
  const exp = computeExperience(r.value.roles)
  const skillScores = Object.fromEntries(r.value.skills.map(s => [s.id, toPct(s.score)]))

  // College from the resume, if the form didn't say
  const collegeText = c.fields.education || r.value.education.map(e => e.institution).join('; ')
  const preferred = matchPreferredColleges(collegeText, spec.preferredColleges)

  await db().from('evaluations').insert({
    candidate_id: c.id,
    stage: 'resume',
    actor_type: 'ai',
    model: r.model,
    role_version: version,
    score: Math.round(Object.values(skillScores).reduce((a, b) => a + b, 0) / Math.max(1, Object.values(skillScores).length)),
    details: { skills: r.value.skills.map(s => ({ skillId: s.id, score: s.score, evidence: s.evidence, reasoning: s.reasoning })), skillScores, roles: r.value.roles, education: r.value.education, years: exp.fullTimeYears, internshipYears: exp.internshipYears, datesComplete: exp.complete, summary: r.value.summary, ...(r.fellBackFrom ? { fellBackFrom: r.fellBackFrom } : {}) },
  })

  // "2+ years" on the form: the resume decides
  const e = spec.eligibility.experience
  const upper = e.enabled && e.maxYears !== null ? Math.round(e.maxYears * (1 + e.tolerancePct / 100) * 10) / 10 : null
  const lower = e.enabled ? Math.round(e.minYears * (1 - e.tolerancePct / 100) * 10) / 10 : null
  const verify = flags.some(f => f.startsWith('Verify experience from resume'))
  const parsed = { ...c.parsed, flags: flags.filter(f => !f.startsWith('Verify experience from resume')), preferredColleges: preferred, resumeYears: exp.fullTimeYears }

  if (verify && exp.complete && upper !== null && exp.fullTimeYears > upper) {
    await recordDecision({ candidateId: c.id, stage: 'resume', outcome: e.action === 'review' ? 'review' : 'exclude', actorType: 'system', reason: `Said “${c.fields.experience}” on the form; the resume shows ${exp.fullTimeYears} years of full-time work — above the role's limit of ${upper} years.` })
    await db().from('candidates').update({ parsed, status: e.action === 'review' ? 'review' : 'out', updated_at: new Date().toISOString() }).eq('id', c.id)
    return
  }
  if (verify && exp.complete && lower !== null && exp.fullTimeYears < lower) {
    parsed.flags.push(`Resume shows ${exp.fullTimeYears} yrs full-time, below the ${lower} yr minimum`)
  }
  if (verify && !exp.complete) parsed.flags.push('Some resume dates are unclear — experience not fully verified')
  await db().from('candidates').update({ parsed, updated_at: new Date().toISOString() }).eq('id', c.id)
}
