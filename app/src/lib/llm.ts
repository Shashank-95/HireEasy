import { useSettingsStore } from '../stores/settingsStore'

export interface ScreeningResult {
  candidateId: string
  score: number
  reasoning: string
  skillScores: Record<string, number>
  flags: string[]
}

export interface ExtractedSkill {
  name: string
  weight: number
  rationale?: string
}

export interface ExtractedSkillSet {
  technical: ExtractedSkill[]
  nonTechnical: ExtractedSkill[]
  behavioral: ExtractedSkill[]
}

const SKILL_EXTRACTION_PROMPT = `You are a senior technical recruiter and hiring strategist with 15+ years of experience hiring for top companies. Your task is to analyze a job description and extract the EXACT skills that are required to perform this role successfully, then assign intelligent weights that reflect each skill's actual importance.

Job Title: {{title}}
Department: {{department}}

Job Description:
{{jd}}

EXTRACTION GUIDELINES:

1. **Read the JD carefully and think about what the role actually requires day-to-day.** Don't just pattern-match keywords. Understand the seniority, the responsibilities, the scope, and the impact area.

2. **Categorize skills into THREE buckets:**
   - **Technical (Hard) Skills:** Concrete tools, programming languages, frameworks, platforms, methodologies, domain expertise (e.g., Python, SQL, Figma, AWS, A/B Testing, Financial Modeling, SEO, Salesforce)
   - **Non-Technical (Soft) Skills:** Professional capabilities that aren't tied to specific tools (e.g., Stakeholder Management, Cross-functional Collaboration, Written Communication, Strategic Thinking, Problem-Solving, Mentorship)
   - **Behavioral Traits:** Personality and cultural-fit signals (e.g., Ownership Mindset, Bias for Action, Customer Obsession, Growth Mindset, Resilience, Curiosity)

3. **Weight assignment rules — THINK LIKE A HIRING MANAGER:**
   - Skills explicitly listed as "must-have", "required", or mentioned multiple times → HIGHER weight
   - Skills mentioned in the core responsibilities section → HIGHER weight than skills in "nice to have"
   - Skills critical to the day-to-day work → HIGHER weight
   - Skills that are baseline expectations (e.g., "good communication" for any role) → LOWER weight
   - Specialized/rare skills that differentiate top candidates → HIGHER weight
   - The MOST critical skill in each category should have the highest weight, and weights should taper based on actual importance

4. **CRITICAL CONSTRAINTS:**
   - The SUM of weights within each category MUST equal exactly 100. Not 99, not 101 — exactly 100.
   - Each category should have between 3 and 7 skills (no more, no less unless the JD truly demands it).
   - Skill names should be 1-3 words, professional, and specific (e.g., "Product Strategy" not "strategic thinking about products").
   - For behavioral traits, only include them if the JD strongly suggests specific cultural traits. If the JD is generic, return fewer behavioral skills (3-4 is fine).
   - DO NOT make up skills not implied by the JD. Stay grounded in what the JD actually says.
   - DO NOT duplicate skills across categories.

5. **Quality bar:** Imagine you're presenting this to the hiring manager. They should look at the list and say "yes, these are exactly the skills we'd evaluate candidates on, and the weights match our priorities."

Return ONLY a valid JSON object in this exact format:
{
  "technical": [
    {"name": "Skill Name", "weight": 35, "rationale": "Brief reason from JD"}
  ],
  "nonTechnical": [
    {"name": "Skill Name", "weight": 30, "rationale": "Brief reason from JD"}
  ],
  "behavioral": [
    {"name": "Trait Name", "weight": 33, "rationale": "Brief reason from JD"}
  ]
}

VERIFY before returning:
- technical weights sum to 100
- nonTechnical weights sum to 100
- behavioral weights sum to 100 (or empty array if no clear signals)`


export interface ResumeAnalysisResult {
  candidateId: string
  projectRelevance: number
  impactScore: number
  skillProficiency: number
  curiosityScore: number
  overallScore: number
  highlights: string[]
  concerns: string[]
}

const SCREENING_PROMPT = `You are an experienced senior recruiter with 15+ years of hiring expertise. Evaluate this candidate's screening responses against the role requirements with intellectual honesty — no inflation, no over-correction.

ROLE: {{job_title}}
{{department_line}}

JOB CONTEXT:
{{jd}}

REQUIRED SKILLS:
TECHNICAL: {{tech_skills}}
NON-TECHNICAL: {{nontech_skills}}
{{behavioral_section}}

CANDIDATE'S SCREENING RESPONSES:
{{response}}

═══════════════════════════════════════
EVALUATION FRAMEWORK
═══════════════════════════════════════

The candidate's score will be ranked against all other candidates as a percentile, so focus on RELATIVE differentiation — make sure stronger answers score meaningfully higher than weaker ones. Use the full 0-100 range. Don't cluster scores in the middle.

STAGE 1 — SKILL DEMONSTRATION (score each required skill 0-100)
Use this calibrated scale:
  • 0-15: No evidence at all in their responses
  • 20-35: Mentioned without context or just claims to have it
  • 40-55: Shows baseline familiarity / general understanding
  • 60-75: Demonstrates real experience with at least one concrete example
  • 80-90: Strong example showing depth and judgment
  • 95-100: Exceptional — specific example with measurable impact, scale, or sophisticated insight

A typical candidate who has worked in the field but gives a generic example should score around 50-65 for that skill. Don't penalize candidates who clearly have the skill just because they didn't write a perfect response.

STAGE 2 — QUALITY SIGNALS (each 0-100)
  • specificity: Concrete details, names, projects vs vague generalities
  • quantification: Numbers, metrics, scale (users, %, $, time)
  • relevance: Tailored to THIS role vs generic copy-paste
  • communication: Clear, structured writing
  • depth: Thoughtful answers vs one-liners or rambling

STAGE 3 — RED FLAGS (only set true if clearly present)
  • generic_buzzwords: Buzzword salad with no substance
  • inconsistent: Contradictions across answers
  • misaligned: Experience clearly wrong for this role
  • low_effort: Multiple very short answers
  • ai_signature: Obviously raw ChatGPT output
  • no_specifics: Zero concrete examples anywhere
  • role_confusion: Answers describe a different role

STAGE 4 — DECISION TIER
  • STRONG_YES: Clearly above-average candidate, specific examples, strong skill demonstration
  • YES: Solid candidate, demonstrates most required skills with reasonable depth
  • MAYBE: Has some skills but with gaps; borderline
  • NO: Major skill gaps OR multiple red flags OR clearly wrong fit

Aim for roughly: 15-20% STRONG_YES, 25-30% YES, 25-30% MAYBE, 20-30% NO across a typical candidate pool. Be honest — neither inflate weak candidates nor punish good ones for minor flaws.

Return ONLY this JSON (no markdown, no commentary):
{
  "skillScores": { "<exact skill name>": <0-100>, ... for every skill listed },
  "qualitySignals": {
    "specificity": <0-100>,
    "quantification": <0-100>,
    "relevance": <0-100>,
    "communication": <0-100>,
    "depth": <0-100>
  },
  "redFlags": ["flag1", "flag2"],
  "tier": "STRONG_YES" | "YES" | "MAYBE" | "NO",
  "topStrengths": ["specific strength 1", "specific strength 2"],
  "concerns": ["specific concern 1", "specific concern 2"],
  "summary": "<1-2 sentence honest assessment>"
}`

const RESUME_ANALYSIS_PROMPT = `You are an expert resume analyst. Evaluate this candidate's resume against the job description and required skills.

Job Description:
{{jd}}

Required Skills:
{{skills}}

Resume Content:
{{resume}}

Analyze and score (0-100 each):
1. Project Relevance: How well past projects align with role requirements
2. Impact: Quantifiable outcomes and results demonstrated
3. Skill Proficiency: Depth of relevant skills mentioned
4. Curiosity & Growth: Certifications, side projects, learning signals

Respond in JSON:
{
  "projectRelevance": <0-100>,
  "impactScore": <0-100>,
  "skillProficiency": <0-100>,
  "curiosityScore": <0-100>,
  "overallScore": <0-100>,
  "highlights": ["<key strengths>"],
  "concerns": ["<potential issues>"]
}`

export type ScreeningTier = 'STRONG_YES' | 'YES' | 'MAYBE' | 'NO'

export interface RigorousScreeningResult {
  skillScores: Record<string, number>
  qualitySignals: {
    specificity: number
    quantification: number
    relevance: number
    communication: number
    depth: number
  }
  redFlags: string[]
  tier: ScreeningTier
  topStrengths: string[]
  concerns: string[]
  summary: string
  // Composite computed on the client from skill weights:
  compositeScore: number
}

export async function screenCandidate(
  candidateResponse: string,
  jobDescription: string,
  technicalSkills: { name: string; weight: number }[],
  nonTechSkills: { name: string; weight: number }[],
  behavioralSkills: { name: string; weight: number }[],
  context: { jobTitle?: string; department?: string } = {},
): Promise<RigorousScreeningResult> {
  const settings = useSettingsStore.getState()

  const techStr = technicalSkills.length > 0
    ? technicalSkills.map(s => `${s.name} (weight ${s.weight}%)`).join(', ')
    : 'Not specified'
  const nonTechStr = nonTechSkills.length > 0
    ? nonTechSkills.map(s => `${s.name} (weight ${s.weight}%)`).join(', ')
    : 'Not specified'
  const behavioralStr = behavioralSkills.length > 0
    ? `BEHAVIORAL: ${behavioralSkills.map(s => `${s.name} (weight ${s.weight}%)`).join(', ')}`
    : ''

  const prompt = SCREENING_PROMPT
    .replace('{{job_title}}', context.jobTitle || 'Not specified')
    .replace('{{department_line}}', context.department ? `DEPARTMENT: ${context.department}` : '')
    .replace('{{jd}}', jobDescription || 'Not provided')
    .replace('{{tech_skills}}', techStr)
    .replace('{{nontech_skills}}', nonTechStr)
    .replace('{{behavioral_section}}', behavioralStr)
    .replace('{{response}}', candidateResponse)

  const response = await callLLMWithRetry(prompt, settings)
  const parsed = parseJsonResponse(response) as Partial<RigorousScreeningResult>

  // Defensive defaults
  const skillScores = parsed.skillScores || {}
  const qualitySignals = {
    specificity: parsed.qualitySignals?.specificity ?? 0,
    quantification: parsed.qualitySignals?.quantification ?? 0,
    relevance: parsed.qualitySignals?.relevance ?? 0,
    communication: parsed.qualitySignals?.communication ?? 0,
    depth: parsed.qualitySignals?.depth ?? 0,
  }
  const redFlags = parsed.redFlags || []
  const tier = (parsed.tier || 'NO') as ScreeningTier

  // Compute composite score on the client using actual skill weights — not the LLM's possibly-biased single number
  const compositeScore = computeCompositeScore({
    skillScores,
    qualitySignals,
    redFlags,
    tier,
    technicalSkills,
    nonTechSkills,
    behavioralSkills,
  })

  return {
    skillScores,
    qualitySignals,
    redFlags,
    tier,
    topStrengths: parsed.topStrengths || [],
    concerns: parsed.concerns || [],
    summary: parsed.summary || '',
    compositeScore,
  }
}

/**
 * Calculates a rigorous composite score from skill scores and quality signals.
 * This is computed on the CLIENT (not by the LLM) to ensure consistency and
 * prevent the LLM from defaulting to inflated middle scores.
 *
 * Weighting:
 * - 60% Skill match (weighted by configured importance per skill)
 * - 30% Quality signals (specificity, quantification, relevance, communication, depth)
 * - Red flag deductions (each flag = -8 points, max -30)
 * - Tier guard rails (STRONG_YES floor 70, NO ceiling 35)
 */
function computeCompositeScore(args: {
  skillScores: Record<string, number>
  qualitySignals: { specificity: number; quantification: number; relevance: number; communication: number; depth: number }
  redFlags: string[]
  tier: ScreeningTier
  technicalSkills: { name: string; weight: number }[]
  nonTechSkills: { name: string; weight: number }[]
  behavioralSkills: { name: string; weight: number }[]
}): number {
  const { skillScores, qualitySignals, redFlags, tier, technicalSkills, nonTechSkills, behavioralSkills } = args

  // Helper: weighted average of skills in a category. Each category's weights already sum to 100.
  const categoryAvg = (skills: { name: string; weight: number }[]): number => {
    if (skills.length === 0) return 0
    let sum = 0
    let totalWeight = 0
    for (const s of skills) {
      const score = skillScores[s.name] ?? 0
      sum += score * s.weight
      totalWeight += s.weight
    }
    return totalWeight > 0 ? sum / totalWeight : 0
  }

  // Combine the three categories with sensible inter-category weights:
  // Technical 50%, Non-technical 35%, Behavioral 15%. If a category is empty, redistribute.
  const techScore = categoryAvg(technicalSkills)
  const nonTechScore = categoryAvg(nonTechSkills)
  const behScore = categoryAvg(behavioralSkills)

  let skillMatchScore = 0
  if (technicalSkills.length > 0 && nonTechSkills.length > 0 && behavioralSkills.length > 0) {
    skillMatchScore = techScore * 0.50 + nonTechScore * 0.35 + behScore * 0.15
  } else if (technicalSkills.length > 0 && nonTechSkills.length > 0) {
    skillMatchScore = techScore * 0.60 + nonTechScore * 0.40
  } else if (technicalSkills.length > 0) {
    skillMatchScore = techScore
  } else if (nonTechSkills.length > 0) {
    skillMatchScore = nonTechScore
  }

  // Quality signals — average of all 5 signals
  const qualityAvg =
    (qualitySignals.specificity + qualitySignals.quantification + qualitySignals.relevance +
     qualitySignals.communication + qualitySignals.depth) / 5

  // Composite: 70% skill match, 30% quality signals — focus on actual evidence
  const quantBoost = qualitySignals.quantification > 70 ? 3 : 0
  let composite = (skillMatchScore * 0.70) + (qualityAvg * 0.30) + quantBoost

  // Red flag deductions — each flag = -5, capped at -20 (was too harsh before)
  const flagPenalty = Math.min(redFlags.length * 5, 20)
  composite -= flagPenalty

  // Tier guard rails — looser, used only to break extreme inconsistencies
  if (tier === 'NO' && composite > 55) composite = 55
  if (tier === 'STRONG_YES' && composite < 65) composite = 65

  return Math.max(0, Math.min(100, Math.round(composite)))
}

/**
 * Extracts skills from a job description using the LLM, with intelligent weighting.
 * Returns three categories (technical, non-technical, behavioral) where each
 * sums to exactly 100 (or empty if behavioral has no clear signals).
 */
export async function extractSkillsFromJD(
  jobTitle: string,
  jobDescription: string,
  department?: string,
): Promise<ExtractedSkillSet> {
  const settings = useSettingsStore.getState()

  const prompt = SKILL_EXTRACTION_PROMPT
    .replace('{{title}}', jobTitle || 'Not specified')
    .replace('{{department}}', department || 'Not specified')
    .replace('{{jd}}', jobDescription)

  const response = await callLLMWithRetry(prompt, settings)
  const parsed = parseJsonResponse(response) as {
    technical?: ExtractedSkill[]
    nonTechnical?: ExtractedSkill[]
    behavioral?: ExtractedSkill[]
  }

  // Normalize and ensure each category sums to exactly 100
  return {
    technical: normalizeWeights(parsed.technical || []),
    nonTechnical: normalizeWeights(parsed.nonTechnical || []),
    behavioral: normalizeWeights(parsed.behavioral || []),
  }
}

// Forces a skill list's weights to sum to exactly 100 by adjusting the largest
// skill for any rounding error. If the LLM returns weights that don't sum to 100,
// we proportionally rescale them.
function normalizeWeights(skills: ExtractedSkill[]): ExtractedSkill[] {
  if (skills.length === 0) return []
  if (skills.length === 1) return [{ ...skills[0], weight: 100 }]

  const total = skills.reduce((sum, s) => sum + (s.weight || 0), 0)
  if (total === 0) {
    // Distribute evenly
    const base = Math.floor(100 / skills.length)
    const remainder = 100 - base * skills.length
    return skills.map((s, i) => ({ ...s, weight: base + (i < remainder ? 1 : 0) }))
  }

  // Rescale proportionally to sum to 100
  const scaled = skills.map(s => ({
    ...s,
    weight: Math.max(1, Math.round((s.weight / total) * 100)),
  }))

  // Fix rounding error
  const newTotal = scaled.reduce((sum, s) => sum + s.weight, 0)
  if (newTotal !== 100) {
    const diff = 100 - newTotal
    // Apply correction to the highest-weighted skill
    const sortedIdx = scaled
      .map((s, i) => ({ i, w: s.weight }))
      .sort((a, b) => b.w - a.w)[0].i
    scaled[sortedIdx] = { ...scaled[sortedIdx], weight: Math.max(1, scaled[sortedIdx].weight + diff) }
  }
  return scaled
}

export async function analyzeResume(
  resumeContent: string,
  jobDescription: string,
  allSkills: { name: string; weight: number }[],
): Promise<ResumeAnalysisResult> {
  const settings = useSettingsStore.getState()
  const skillsStr = allSkills.map(s => `${s.name} (${s.weight}%)`).join(', ')

  const prompt = RESUME_ANALYSIS_PROMPT
    .replace('{{jd}}', jobDescription)
    .replace('{{skills}}', skillsStr)
    .replace('{{resume}}', resumeContent)

  const response = await callLLMWithRetry(prompt, settings)
  return parseJsonResponse(response)
}

function parseJsonResponse(raw: string): any {
  // Strip markdown fences and extra whitespace
  let cleaned = raw.trim()
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  // Try direct parse first
  try {
    return JSON.parse(cleaned)
  } catch {
    // Try extracting JSON object from surrounding text
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (match) {
      return JSON.parse(match[0])
    }
    throw new Error(`Failed to parse LLM response as JSON: ${cleaned.substring(0, 200)}`)
  }
}

const INTERVIEW_SCORING_PROMPT = `You are an expert interviewer evaluating a candidate's spoken responses. Analyze the interview transcripts against the job description and skills.

Job Title: {{job_title}}
Job Description:
{{jd}}

Required Skills:
{{skills}}

Interview Transcripts:
{{transcripts}}

Evaluate the candidate on:
1. Communication clarity and articulation
2. Technical depth and accuracy of answers
3. Problem solving approach
4. Relevance of answers to the role
5. Overall impression

Respond in JSON:
{
  "overallScore": <0-100>,
  "communication": <0-100>,
  "technicalDepth": <0-100>,
  "problemSolving": <0-100>,
  "relevance": <0-100>,
  "feedback": "<2-3 sentence summary of candidate performance>",
  "strengths": ["<key strength 1>", "<key strength 2>"],
  "improvements": ["<area for improvement 1>", "<area for improvement 2>"]
}`

export interface InterviewScoreResult {
  overallScore: number
  communication: number
  technicalDepth: number
  problemSolving: number
  relevance: number
  feedback: string
  strengths: string[]
  improvements: string[]
}

export async function scoreInterview(
  transcripts: { question: string; transcript: string }[],
  jobTitle: string,
  jobDescription: string,
  allSkills: { name: string; weight: number }[],
): Promise<InterviewScoreResult> {
  const settings = useSettingsStore.getState()
  const skillsStr = allSkills.map(s => `${s.name} (${s.weight}%)`).join(', ')
  const transcriptStr = transcripts.map((t, i) =>
    `Q${i + 1}: ${t.question}\nA${i + 1}: ${t.transcript}`
  ).join('\n\n')

  const prompt = INTERVIEW_SCORING_PROMPT
    .replace('{{job_title}}', jobTitle)
    .replace('{{jd}}', jobDescription || 'Not provided')
    .replace('{{skills}}', skillsStr || 'Not specified')
    .replace('{{transcripts}}', transcriptStr)

  const response = await callLLMWithRetry(prompt, settings)
  return parseJsonResponse(response)
}

/** Errors worth retrying: rate limits, overload, and transient network faults. */
function isRetryable(err: any): boolean {
  const msg = String(err?.message || err || '')
  return (
    /\b(429|500|502|503|504|529)\b/.test(msg) ||
    /rate.?limit|overload|timeout|temporarily|try again|ECONNRESET|Failed to fetch|network/i.test(msg)
  )
}

/**
 * Wraps callLLM with exponential backoff + jitter.
 *
 * Without this, a single 429 on a free tier gives the candidate a score of 0 and
 * silently corrupts the entire percentile ranking. At 1000 candidates that is the
 * difference between a usable shortlist and garbage.
 */
async function callLLMWithRetry(
  prompt: string,
  settings: ReturnType<typeof useSettingsStore.getState>,
  maxAttempts = 4,
): Promise<string> {
  let lastErr: any
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await callLLM(prompt, settings)
    } catch (err) {
      lastErr = err
      if (attempt === maxAttempts - 1 || !isRetryable(err)) throw err
      // 1s, 2.5s, 6s (+ up to 40% jitter) — spreads out a thundering herd of retries
      const base = 1000 * Math.pow(2.5, attempt)
      const delay = base + Math.random() * base * 0.4
      await new Promise(r => setTimeout(r, delay))
    }
  }
  throw lastErr
}

async function callLLM(prompt: string, settings: ReturnType<typeof useSettingsStore.getState>): Promise<string> {
  const provider = settings.preferredLlm

  if (provider === 'openai') {
    if (!settings.openaiKey) throw new Error('OpenAI API key not configured')
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`OpenAI error ${res.status}: ${err.error?.message || res.statusText}`)
    }
    const data = await res.json()
    if (!data.choices?.[0]?.message?.content) {
      throw new Error('OpenAI returned empty response')
    }
    return data.choices[0].message.content
  }

  if (provider === 'anthropic') {
    if (!settings.anthropicKey) throw new Error('Anthropic API key not configured')
    // Anthropic API does not support CORS — use a proxy or fallback to another provider
    // Try direct call first (works in Electron), with error guidance for browser
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': settings.anthropicKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 2048,
          messages: [{ role: 'user', content: prompt }],
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(`Anthropic error ${res.status}: ${err.error?.message || res.statusText}`)
      }
      const data = await res.json()
      if (!data.content?.[0]?.text) {
        throw new Error('Anthropic returned empty response')
      }
      return data.content[0].text
    } catch (err: any) {
      if (err.message?.includes('Failed to fetch') || err.message?.includes('CORS')) {
        throw new Error('Anthropic API cannot be called from the browser (CORS). Switch to OpenAI or Gemini in Settings, or run the Electron app.')
      }
      throw err
    }
  }

  if (provider === 'gemini') {
    if (!settings.geminiKey) throw new Error('Gemini API key not configured')
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${settings.geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, responseMimeType: 'application/json' },
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`Gemini error ${res.status}: ${err.error?.message || res.statusText}`)
    }
    const data = await res.json()
    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error('Gemini returned empty response')
    }
    return data.candidates[0].content.parts[0].text
  }

  if (provider === 'groq') {
    if (!settings.groqKey) throw new Error('Groq API key not configured')
    // Groq uses OpenAI-compatible API — same shape as OpenAI
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.groqKey}`,
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        response_format: { type: 'json_object' },
        // Reasoning model — keep effort low for speed and leave reasoning out of the response
        reasoning_effort: 'low',
        include_reasoning: false,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`Groq error ${res.status}: ${err.error?.message || res.statusText}`)
    }
    const data = await res.json()
    if (!data.choices?.[0]?.message?.content) {
      throw new Error('Groq returned empty response')
    }
    return data.choices[0].message.content
  }

  throw new Error(`Unknown LLM provider: ${provider}. Configure one in Settings.`)
}
