import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/supabase/server'
import { addEvent, assertOpen, loadSession, SessionError, type LoadedSession } from '@/lib/interview/session'
import { askJson, hasGroq, MODELS, scoringChain, transcribe } from '@/lib/ai/providers'
import { buildFollowUpPrompt, FOLLOWUP_SYSTEM, FollowUpOutput } from '@/lib/ai/interview'
import { scoreSession } from '@/lib/pipeline/rounds'
import { QuotaExceeded } from '@/lib/ai/quota'

export const maxDuration = 60

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
const fail = (e: unknown) => (e instanceof SessionError ? json({ error: e.message }, e.status) : json({ error: 'Something went wrong on our side. Please try again in a moment.' }, 500))

async function answered(sessionId: string) {
  const { data } = await db().from('interview_answers').select('question_id, followup_index, transcript').eq('session_id', sessionId)
  return data ?? []
}

function publicState(s: LoadedSession, ans: { question_id: string; followup_index: number; transcript: string | null }[]) {
  const pendingFollowUps = s.events.filter(e => e.type === 'followup' && !ans.some(a => a.question_id === e.questionId && a.followup_index === e.index))
  return {
    state: s.state,
    preview: s.preview,
    roleTitle: s.roleTitle,
    roundName: s.round.name,
    firstName: s.candidateName,
    expiresAt: s.expiresAt,
    questions: s.round.questions.map(q => ({ id: q.id, text: q.text, timeLimitSec: q.timeLimitSec })),
    answered: ans.map(a => ({ questionId: a.question_id, followupIndex: a.followup_index })),
    pendingFollowUp: pendingFollowUps[0] ? { questionId: pendingFollowUps[0].questionId as string, index: pendingFollowUps[0].index as number, prompt: pendingFollowUps[0].prompt as string } : null,
  }
}

export async function GET(_: NextRequest, ctx: RouteContext<'/api/interview/[token]'>) {
  try {
    const { token } = await ctx.params
    const s = await loadSession(token)
    if (s.state !== 'submitted') assertOpen(s)
    return json(publicState(s, await answered(s.id)))
  } catch (e) {
    return fail(e)
  }
}

export async function POST(req: NextRequest, ctx: RouteContext<'/api/interview/[token]'>) {
  try {
    const { token } = await ctx.params
    const s = await loadSession(token)
    const type = req.headers.get('content-type') ?? ''

    if (type.includes('multipart/form-data')) return await saveAnswer(s, await req.formData())

    const body = (await req.json().catch(() => ({}))) as { action?: string; event?: string; detail?: string }
    if (body.action === 'start') {
      assertOpen(s)
      if (s.state === 'invited') await db().from('interview_sessions').update({ state: 'started', started_at: new Date().toISOString() }).eq('id', s.id)
      await addEvent(s.id, s.events, { type: 'start', userAgent: req.headers.get('user-agent')?.slice(0, 200) ?? '' })
      return json({ ok: true })
    }
    if (body.action === 'event') {
      if (s.state === 'started') await addEvent(s.id, s.events, { type: String(body.event ?? 'note').slice(0, 40), detail: String(body.detail ?? '').slice(0, 200) })
      return json({ ok: true })
    }
    if (body.action === 'submit') {
      assertOpen(s)
      await db().from('interview_sessions').update({ state: 'submitted', submitted_at: new Date().toISOString() }).eq('id', s.id)
      // Score straight away so a preview shows its result; the engine retries if this fails
      let score: number | null = null
      try {
        score = await scoreSession(s.id)
      } catch {
        score = null
      }
      return json({ ok: true, previewScore: s.preview ? score : undefined })
    }
    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    return fail(e)
  }
}

const MAX_AUDIO = 15 * 1024 * 1024

async function saveAnswer(s: LoadedSession, form: FormData) {
  assertOpen(s)
  if (s.state === 'invited') await db().from('interview_sessions').update({ state: 'started', started_at: new Date().toISOString() }).eq('id', s.id)
  const questionId = String(form.get('questionId') ?? '')
  const followupIndex = Number(form.get('followupIndex') ?? 0)
  const durationMs = Math.round(Number(form.get('durationMs') ?? 0))
  const silent = form.get('silent') === '1'
  const audio = form.get('audio')
  const q = s.round.questions.find(x => x.id === questionId)
  if (!q) throw new SessionError('Unknown question.')
  if (followupIndex < 0 || followupIndex > s.round.maxFollowUps) throw new SessionError('Unknown follow-up.')

  // The prompt comes from the server's own record, never from the browser
  const prompt = followupIndex === 0 ? q.text : (s.events.find(e => e.type === 'followup' && e.questionId === questionId && e.index === followupIndex)?.prompt as string | undefined)
  if (!prompt) throw new SessionError('That follow-up was not asked.')

  const existing = await answered(s.id)
  if (existing.some(a => a.question_id === questionId && a.followup_index === followupIndex)) throw new SessionError('This answer was already saved.', 409)

  let audioPath: string | null = null
  let transcript = ''
  let transcriptPending = false
  if (audio instanceof Blob && audio.size > 0 && !silent) {
    if (audio.size > MAX_AUDIO) throw new SessionError('That recording is too long.')
    if (audio.type && !/^audio\/(webm|ogg|mp4|mpeg|aac|x-m4a|wav)\b/i.test(audio.type)) throw new SessionError('That file is not an audio recording.')
    const ext = audio.type.includes('mp4') || audio.type.includes('aac') ? 'm4a' : audio.type.includes('ogg') ? 'ogg' : 'webm'
    audioPath = `${s.roleId}/${s.id}/${questionId}-${followupIndex}.${ext}`
    await db().storage.from('interview-audio').upload(audioPath, audio, { upsert: false, contentType: audio.type || 'audio/webm' })
    const hint = [s.roleTitle, ...s.spec.mustHaves.map(m => m.name)].join(', ')
    let pending = false
    try {
      transcript = await transcribe(audio, `answer.${ext}`, hint)
    } catch (e) {
      // Out of free transcription for now: keep the recording and transcribe it
      // before scoring, rather than losing the answer
      if (e instanceof QuotaExceeded) pending = true
      else throw new SessionError('We could not process that recording. Please record your answer again.', 502)
    }
    // Whisper invents stock phrases on silence
    if (/^(thank you( for watching)?\.?|you\.?|bye\.?|\.+)$/i.test(transcript.trim())) transcript = ''
    if (pending) transcriptPending = true
  }

  await db().from('interview_answers').insert({ session_id: s.id, question_id: questionId, followup_index: followupIndex, prompt, audio_path: audioPath, transcript: transcriptPending ? null : transcript, duration_ms: durationMs })

  // One probing follow-up, if the round allows it and the answer was thin
  let followUp: { questionId: string; index: number; prompt: string } | null = null
  if (transcript && followupIndex < s.round.maxFollowUps) {
    try {
      const previous = s.events.filter(e => e.type === 'followup' && e.questionId === questionId).map(e => String(e.prompt))
      const all = existing.filter(a => a.question_id === questionId).map(a => a.transcript).concat(transcript).join(' ')
      const r = await askJson({ model: hasGroq() ? MODELS.second : scoringChain(), system: FOLLOWUP_SYSTEM, user: buildFollowUpPrompt(q.text, q.rubric[5], all, previous), schema: FollowUpOutput, timeoutMs: 8_000 })
      if (r.value.needed && r.value.question.trim()) {
        followUp = { questionId, index: followupIndex + 1, prompt: r.value.question.trim().slice(0, 300) }
        await addEvent(s.id, s.events, { type: 'followup', ...followUp })
      }
    } catch {
      // Slow or out of quota: carry on with the next fixed question
    }
  }
  return json({ ok: true, transcript, heard: transcript.length > 0 || transcriptPending, followUp })
}
