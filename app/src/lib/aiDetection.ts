import { useSettingsStore } from '../stores/settingsStore'

export interface AiDetectionResult {
  isAiGenerated: boolean
  score: number
  confidence: number
}

export async function detectAiContent(text: string): Promise<AiDetectionResult> {
  const settings = useSettingsStore.getState()
  const provider = settings.aiDetectionProvider

  switch (provider) {
    case 'sapling':
      return detectWithSapling(text)
    case 'gptzero':
      return detectWithGPTZero(text, settings.aiDetectionKey)
    case 'originality':
      return detectWithOriginality(text, settings.aiDetectionKey)
    case 'copyleaks':
      return detectWithCopyleaks(text, settings.aiDetectionKey)
    default:
      return detectWithSapling(text, settings.aiDetectionKey)
  }
}

async function detectWithSapling(text: string, apiKey?: string): Promise<AiDetectionResult> {
  try {
    const url = apiKey
      ? `https://api.sapling.ai/api/v1/aidetect?key=${apiKey}`
      : 'https://api.sapling.ai/api/v1/aidetect'
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: apiKey || '', text }),
    })
    const data = await res.json()
    const score = data.score ?? 0
    return {
      isAiGenerated: score > 0.7,
      score: Math.round(score * 100),
      confidence: Math.round((data.confidence ?? score) * 100),
    }
  } catch {
    return { isAiGenerated: false, score: 0, confidence: 0 }
  }
}

async function detectWithGPTZero(text: string, apiKey: string): Promise<AiDetectionResult> {
  try {
    const res = await fetch('https://api.gptzero.me/v2/predict/text', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({ document: text }),
    })
    const data = await res.json()
    const score = data.documents?.[0]?.completely_generated_prob ?? 0
    return {
      isAiGenerated: score > 0.7,
      score: Math.round(score * 100),
      confidence: Math.round((data.documents?.[0]?.average_generated_prob ?? score) * 100),
    }
  } catch {
    return { isAiGenerated: false, score: 0, confidence: 0 }
  }
}

async function detectWithOriginality(text: string, apiKey: string): Promise<AiDetectionResult> {
  try {
    const res = await fetch('https://api.originality.ai/api/v1/scan/ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-OAI-API-KEY': apiKey,
      },
      body: JSON.stringify({ content: text }),
    })
    const data = await res.json()
    const score = data.score?.ai ?? 0
    return {
      isAiGenerated: score > 0.7,
      score: Math.round(score * 100),
      confidence: Math.round(score * 100),
    }
  } catch {
    return { isAiGenerated: false, score: 0, confidence: 0 }
  }
}

async function detectWithCopyleaks(text: string, apiKey: string): Promise<AiDetectionResult> {
  try {
    const res = await fetch('https://api.copyleaks.com/v2/writer-detector/check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ text }),
    })
    const data = await res.json()
    const score = data.summary?.ai ?? 0
    return {
      isAiGenerated: score > 0.7,
      score: Math.round(score * 100),
      confidence: Math.round(score * 100),
    }
  } catch {
    return { isAiGenerated: false, score: 0, confidence: 0 }
  }
}

/** Phrases that are hallmarks of unedited LLM output in a job application. */
const AI_TELLS = [
  /\bi am (?:particularly )?(?:excited|thrilled|passionate) (?:about|to)\b/i,
  /\bleverage (?:my|the)\b/i,
  /\bdelve into\b/i,
  /\bit'?s worth noting\b/i,
  /\bin today'?s (?:fast-paced|ever-evolving|dynamic)\b/i,
  /\ba testament to\b/i,
  /\bnavigate the complexities\b/i,
  /\bplays a (?:crucial|pivotal|vital) role\b/i,
  /\bunderscore[sd]?\b/i,
  /\bmeticulous(?:ly)?\b/i,
  /\brobust (?:framework|solution|approach)\b/i,
  /\bsynerg(?:y|ies|istic)\b/i,
  /\bholistic approach\b/i,
]

/**
 * Cheap, deterministic AI-writing heuristics.
 *
 * Runs in O(n) — the previous implementation compared every candidate against
 * every other one (O(n²) with set intersections), which locks the browser solid
 * at 1000 candidates. Near-duplicate detection now uses a bucketed token
 * signature instead of pairwise comparison.
 */
export function heuristicAiDetection(texts: string[]): {
  suspiciousIndices: number[]
  patterns: string[]
  /** Per-candidate 0-100 suspicion score from local heuristics alone */
  scores: number[]
} {
  const patterns: string[] = []
  const suspicious = new Set<number>()
  const scores = new Array(texts.length).fill(0)

  // ── O(n) near-duplicate detection via token signature bucketing ──
  // Two candidates who pasted the same answer land in the same bucket.
  const buckets = new Map<string, number[]>()
  for (let i = 0; i < texts.length; i++) {
    const sig = tokenSignature(texts[i])
    if (!sig) continue
    const list = buckets.get(sig)
    if (list) list.push(i)
    else buckets.set(sig, [i])
  }
  for (const [, members] of buckets) {
    if (members.length > 1) {
      members.forEach(i => {
        suspicious.add(i)
        scores[i] += 35
      })
      patterns.push(`${members.length} candidates submitted near-identical answers`)
    }
  }

  // ── Per-candidate stylistic tells (all O(1) per candidate) ──
  texts.forEach((text, i) => {
    if (!text || text.trim().length < 40) return

    // Em-dash density — AI models overuse them relative to typical applicants
    const emDashes = (text.match(/—/g) || []).length
    const per100Words = (emDashes / Math.max(1, text.split(/\s+/).length)) * 100
    if (per100Words > 1.5) {
      scores[i] += 15
      suspicious.add(i)
    }

    // Uniformly long sentences
    const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0)
    if (sentences.length >= 3) {
      const lengths = sentences.map(s => s.split(/\s+/).length)
      const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length
      if (avg > 26) {
        scores[i] += 15
        suspicious.add(i)
      }
      // Low variance in sentence length is a strong LLM signal — humans vary more
      const variance = lengths.reduce((a, l) => a + (l - avg) ** 2, 0) / lengths.length
      if (avg > 15 && Math.sqrt(variance) < 3.5) {
        scores[i] += 12
        suspicious.add(i)
      }
    }

    // Stock LLM phrasing
    const tells = AI_TELLS.reduce((n, re) => n + (re.test(text) ? 1 : 0), 0)
    if (tells >= 2) {
      scores[i] += Math.min(30, tells * 12)
      suspicious.add(i)
    }

    // Perfectly formatted bullet lists in a free-text box
    if ((text.match(/^\s*[-•*]\s+/gm) || []).length >= 4) {
      scores[i] += 10
    }

    scores[i] = Math.min(100, scores[i])
  })

  return { suspiciousIndices: [...suspicious], patterns, scores }
}

/** Stable signature of the most distinctive tokens, used for duplicate bucketing. */
function tokenSignature(text: string): string {
  if (!text || text.trim().length < 60) return ''
  const words = text
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 5)
  if (words.length < 8) return ''
  // Sorted unique tokens make the signature order-independent
  return [...new Set(words)].sort().slice(0, 24).join('|')
}
