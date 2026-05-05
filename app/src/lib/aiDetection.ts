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

export function heuristicAiDetection(texts: string[]): { suspiciousIndices: number[]; patterns: string[] } {
  const patterns: string[] = []
  const suspiciousIndices: number[] = []

  // Check for em-dash pattern (AI-typical)
  const emDashCounts = texts.map(t => (t.match(/—/g) || []).length)
  const avgEmDash = emDashCounts.reduce((a, b) => a + b, 0) / texts.length
  if (avgEmDash > 2) {
    patterns.push('High em-dash usage (AI indicator)')
  }

  // Check for thematic similarity
  const wordSets = texts.map(t =>
    new Set(t.toLowerCase().split(/\s+/).filter(w => w.length > 4))
  )

  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const intersection = [...wordSets[i]].filter(w => wordSets[j].has(w))
      const similarity = intersection.length / Math.min(wordSets[i].size, wordSets[j].size)
      if (similarity > 0.6) {
        if (!suspiciousIndices.includes(i)) suspiciousIndices.push(i)
        if (!suspiciousIndices.includes(j)) suspiciousIndices.push(j)
        patterns.push(`High thematic similarity between candidates ${i + 1} and ${j + 1}`)
      }
    }
  }

  // Check for overly formal/verbose patterns
  texts.forEach((text, i) => {
    const sentences = text.split(/[.!?]+/).filter(Boolean)
    const avgLength = sentences.reduce((a, s) => a + s.trim().split(/\s+/).length, 0) / sentences.length
    if (avgLength > 25) {
      if (!suspiciousIndices.includes(i)) suspiciousIndices.push(i)
      patterns.push(`Candidate ${i + 1}: Unusually long sentences (avg ${Math.round(avgLength)} words)`)
    }
  })

  return { suspiciousIndices, patterns }
}
