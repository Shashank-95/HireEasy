import { Candidate, Skill } from '../stores/jobStore'
import { escapeRegExp } from './screeningFilters'

/**
 * Checks whether the skills you're weighting can actually be *observed* in the
 * screening answers.
 *
 * The failure this prevents: a JD lists "strong SQL" as a must-have, so skill
 * extraction assigns SQL 30% of the technical weight — but none of the screening
 * questions ask about SQL. Every candidate then scores ~0 on a third of the
 * rubric, which is a constant, not a signal. It compresses the usable score
 * range and dilutes the differentiation that actually matters.
 *
 * This runs locally on the imported answers. No LLM cost.
 */

/** Synonyms for skills whose name rarely appears verbatim in prose. */
const SYNONYMS: Record<string, string[]> = {
  sql: ['sql', 'query', 'queries', 'postgres', 'mysql', 'bigquery', 'redshift', 'snowflake', 'joins', 'database'],
  python: ['python', 'pandas', 'numpy', 'script', 'scripting', 'jupyter', 'notebook'],
  excel: ['excel', 'spreadsheet', 'google sheet', 'pivot'],
  figma: ['figma', 'wireframe', 'mockup', 'prototype'],
  'a/b testing': ['a/b', 'ab test', 'experiment', 'split test', 'control group', 'variant'],
  analytics: ['analytics', 'mixpanel', 'amplitude', 'ga4', 'google analytics', 'dashboard', 'funnel', 'metric'],
  ai: ['ai', 'chatgpt', 'claude', 'gemini', 'perplexity', 'llm', 'copilot', 'prompt', 'genai', 'gpt'],
  'product sense': ['user problem', 'user need', 'product sense', 'trade-off', 'tradeoff', 'prioriti'],
  'stakeholder management': ['stakeholder', 'cross-functional', 'cross functional', 'alignment', 'buy-in', 'influence'],
  communication: ['communicat', 'wrote', 'writing', 'presented', 'documentation', 'prd', 'articulat'],
  'data analysis': ['data', 'analys', 'analyz', 'insight', 'cohort', 'segment', 'retention', 'dau', 'mau'],
  roadmap: ['roadmap', 'backlog', 'sprint', 'prioriti'],
  research: ['research', 'interview', 'survey', 'qualitative', 'quantitative', 'user feedback'],
  'problem solving': ['root cause', 'diagnos', 'hypothes', 'framework', 'structur'],
  ownership: ['owned', 'ownership', 'i led', 'i drove', 'end-to-end', 'end to end'],
}

const STOPWORDS = new Set([
  'and', 'the', 'for', 'with', 'skills', 'skill', 'ability', 'strong', 'good',
  'excellent', 'knowledge', 'experience', 'management', 'understanding',
  'tools', 'tool', 'proficiency', 'proficient', 'expertise', 'familiarity',
])

/**
 * Whole-word matching. Short terms (<= 3 chars: "ai", "sql", "prd") must match
 * as a complete word — as substrings "ai" matched inside "said", "maintain" and
 * "explain", making AI look evidenced in every answer. Longer terms match as a
 * word prefix so stems like "prioriti" or "analys" still catch their variants.
 */
function termPattern(term: string): string {
  const body = escapeRegExp(term)
  return term.length <= 3 ? `(?<![a-z0-9])${body}(?![a-z0-9])` : `(?<![a-z0-9])${body}`
}

/** Does `needle` appear as a whole word (or word sequence) inside `haystack`? */
const containsWord = (haystack: string, needle: string) =>
  needle.length > 0 && new RegExp(`(?<![a-z0-9])${escapeRegExp(needle)}(?![a-z0-9])`).test(haystack)

/** Build the set of match terms for a skill: its own tokens plus known synonyms. */
function matchTerms(skillName: string): string[] {
  const lower = skillName.toLowerCase().trim()
  const terms = new Set<string>()

  if (lower.length >= 3) terms.add(lower)

  // Synonym entries whose key is a word in the skill name (or vice versa).
  // Whole words only: a substring check gave "Attention to Detail" the AI
  // synonyms because "detail" contains "ai".
  for (const [key, syns] of Object.entries(SYNONYMS)) {
    if (containsWord(lower, key) || (lower.length >= 3 && containsWord(key, lower))) {
      syns.forEach(s => terms.add(s))
    }
  }

  // Significant individual words from the skill name
  for (const word of lower.split(/[\s/&,-]+/)) {
    if (word.length > 3 && !STOPWORDS.has(word)) terms.add(word)
  }

  return [...terms]
}

export interface SkillEvidence {
  skill: Skill
  /** Fraction of candidates (0-1) whose answers contain any match term */
  coverage: number
  matchedCount: number
  /** True when this skill is heavily weighted but barely evidenced */
  underEvidenced: boolean
}

export interface EvidenceReport {
  perSkill: SkillEvidence[]
  /** Total weight sitting on skills that can't be assessed from the answers */
  wastedWeight: number
  sampleSize: number
}

/** Coverage below this means the skill effectively can't be scored at L1. */
const LOW_COVERAGE = 0.15
/** Only warn about skills carrying at least this much weight in their category. */
const MATERIAL_WEIGHT = 10

/**
 * @param sampleSize cap the number of candidates scanned — 300 is plenty to
 *        estimate coverage and keeps this instant at 1000+ applicants.
 */
export function analyseSkillEvidence(
  skills: Skill[],
  candidates: Candidate[],
  sampleSize = 300,
): EvidenceReport | null {
  if (skills.length === 0 || candidates.length === 0) return null

  // Evenly-spaced sample so we don't bias toward early submissions
  const step = Math.max(1, Math.floor(candidates.length / sampleSize))
  const sample: string[] = []
  for (let i = 0; i < candidates.length && sample.length < sampleSize; i += step) {
    const text = Object.values(candidates[i].responses).join(' ').toLowerCase()
    if (text.trim()) sample.push(text)
  }
  if (sample.length === 0) return null

  const perSkill: SkillEvidence[] = skills
    .filter(s => s.name.trim())
    .map(skill => {
      const terms = matchTerms(skill.name)
      if (terms.length === 0) {
        // Nothing to look for (e.g. a one-letter name) — don't claim it's unmeasurable
        return { skill, coverage: 1, matchedCount: sample.length, underEvidenced: false }
      }
      const pattern = new RegExp(terms.map(termPattern).join('|'))
      const matchedCount = sample.filter(text => pattern.test(text)).length
      const coverage = matchedCount / sample.length
      return {
        skill,
        coverage,
        matchedCount,
        underEvidenced: coverage < LOW_COVERAGE && skill.weight >= MATERIAL_WEIGHT,
      }
    })

  const wastedWeight = perSkill
    .filter(s => s.underEvidenced)
    .reduce((sum, s) => sum + s.skill.weight, 0)

  return { perSkill, wastedWeight, sampleSize: sample.length }
}

/**
 * Redistributes weight away from skills the answers can't evidence, onto the
 * ones they can — keeping the category total at exactly 100.
 */
export function rebalanceToEvidenced(skills: Skill[], report: EvidenceReport): Skill[] {
  const evidenced = skills.filter(s => {
    const e = report.perSkill.find(p => p.skill.id === s.id)
    return e && !e.underEvidenced
  })

  // Nothing to move onto — leave the weights alone rather than zeroing everything
  if (evidenced.length === 0) return skills

  const evidencedTotal = evidenced.reduce((sum, s) => sum + s.weight, 0)
  if (evidencedTotal === 0) {
    const even = Math.floor(100 / evidenced.length)
    const remainder = 100 - even * evidenced.length
    let i = 0
    return skills.map(s => {
      const isEvidenced = evidenced.some(e => e.id === s.id)
      if (!isEvidenced) return { ...s, weight: 0 }
      const w = even + (i < remainder ? 1 : 0)
      i++
      return { ...s, weight: w }
    })
  }

  const scaled = skills.map(s => {
    const isEvidenced = evidenced.some(e => e.id === s.id)
    return { ...s, weight: isEvidenced ? Math.round((s.weight / evidencedTotal) * 100) : 0 }
  })

  // Correct rounding drift on the heaviest evidenced skill
  const total = scaled.reduce((sum, s) => sum + s.weight, 0)
  if (total !== 100) {
    const idx = scaled.reduce((best, s, i) => (s.weight > scaled[best].weight ? i : best), 0)
    scaled[idx] = { ...scaled[idx], weight: Math.max(1, scaled[idx].weight + (100 - total)) }
  }
  return scaled
}
