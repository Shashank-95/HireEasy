import { useSettingsStore } from '../stores/settingsStore'

export interface ScreeningResult {
  candidateId: string
  score: number
  reasoning: string
  skillScores: Record<string, number>
  flags: string[]
}

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

const SCREENING_PROMPT = `You are an expert HR screener. Evaluate the following candidate response against the job description and required skills.

Job Description:
{{jd}}

Required Technical Skills (with weights):
{{tech_skills}}

Required Non-Technical Skills (with weights):
{{nontech_skills}}

{{behavioral_section}}

Candidate Response:
{{response}}

Score the candidate from 0-100 based on:
1. Relevance of their response to the job requirements
2. Demonstration of required skills
3. Quality and specificity of their answers
4. Red flags or concerns

Respond in JSON format:
{
  "score": <number 0-100>,
  "reasoning": "<brief explanation>",
  "skillScores": {"<skill_name>": <score 0-100>, ...},
  "flags": ["<any concerns>"]
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

export async function screenCandidate(
  candidateResponse: string,
  jobDescription: string,
  technicalSkills: { name: string; weight: number }[],
  nonTechSkills: { name: string; weight: number }[],
  behavioralSkills: { name: string; weight: number }[],
): Promise<{ score: number; reasoning: string; skillScores: Record<string, number>; flags: string[] }> {
  const settings = useSettingsStore.getState()

  const techStr = technicalSkills.map(s => `${s.name} (weight: ${s.weight}%)`).join(', ')
  const nonTechStr = nonTechSkills.map(s => `${s.name} (weight: ${s.weight}%)`).join(', ')
  const behavioralStr = behavioralSkills.length > 0
    ? `Behavioral Skills:\n${behavioralSkills.map(s => `${s.name} (weight: ${s.weight}%)`).join(', ')}`
    : ''

  const prompt = SCREENING_PROMPT
    .replace('{{jd}}', jobDescription)
    .replace('{{tech_skills}}', techStr)
    .replace('{{nontech_skills}}', nonTechStr)
    .replace('{{behavioral_section}}', behavioralStr)
    .replace('{{response}}', candidateResponse)

  const response = await callLLM(prompt, settings)
  return parseJsonResponse(response)
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

  const response = await callLLM(prompt, settings)
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

  const response = await callLLM(prompt, settings)
  return parseJsonResponse(response)
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
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${settings.geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3 },
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

  throw new Error(`Unknown LLM provider: ${provider}. Configure one in Settings.`)
}
