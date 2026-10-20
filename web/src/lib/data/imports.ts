import 'server-only'
import { safeFetch, TooLarge, UnsafeUrl } from '../net'
import { db } from '../supabase/server'
import { parseCsv, sheetCsvUrl, buildApplicants, type ParsedSheet } from '../import/sheet'
import { proposeMapping, FIELDS, type ColumnMapping, type Field } from '../import/mapping'
import { standardise } from '../import/standardise'
import { dedupeCandidates } from '../import/dedupe'
import { linkQuestions } from '../import/questions'
import type { RoleSpec } from '../templates/types'
import { runEligibility, type CandidateRow } from './candidates'
import { audit } from './roles'
import { allRows } from './paging'

export class ImportError extends Error {}

/** Fetch a Google Sheet (or any CSV link) as text. */
export async function fetchSheet(link: string): Promise<string> {
  const url = sheetCsvUrl(link) ?? (/^https:\/\/.+\.csv(\?.*)?$/i.test(link) ? link : null)
  if (!url) throw new ImportError('That doesn\'t look like a Google Sheets link. Copy the link from the sheet\'s address bar, or upload the CSV file instead.')
  let res: Response, body: Uint8Array
  try {
    ;({ res, body } = await safeFetch(url, { maxBytes: 20 * 1024 * 1024, timeoutMs: 30_000 }))
  } catch (e) {
    if (e instanceof TooLarge) throw new ImportError('That sheet is larger than 20 MB. Remove unused tabs or columns and try again.')
    if (e instanceof UnsafeUrl) throw new ImportError(e.message)
    throw new ImportError('The sheet could not be reached. Check the link and try again.')
  }
  const type = res.headers.get('content-type') ?? ''
  if (!res.ok || type.includes('text/html')) {
    throw new ImportError('The sheet isn’t shared publicly. In Google Sheets: Share → General access → "Anyone with the link" (Viewer). Or download it as CSV and upload the file here.')
  }
  return new TextDecoder().decode(body)
}

export interface ImportPreview {
  headers: string[]
  totalRows: number
  applicantRows: number
  emptyRows: number
  mapping: ColumnMapping
  /** role question id → sheet column */
  questionLinks: Record<string, string>
  /** First few non-empty values per column, so HR can confirm the mapping */
  samples: Record<string, string[]>
}

export function previewSheet(csv: string, spec: RoleSpec): ImportPreview {
  const sheet = parseCsv(csv)
  if (sheet.headers.length === 0) throw new ImportError('The sheet is empty.')
  const mapping = proposeMapping(sheet.headers)
  const summary = buildApplicants(sheet, mapping)
  const samples: Record<string, string[]> = {}
  for (const h of sheet.headers) {
    samples[h] = sheet.rows.map(r => r[h]).filter(Boolean).slice(0, 3).map(v => (v.length > 120 ? v.slice(0, 120) + '…' : v))
  }
  return {
    headers: sheet.headers,
    totalRows: summary.totalRows,
    applicantRows: summary.applicants.length,
    emptyRows: summary.emptyRows,
    mapping,
    questionLinks: linkQuestions(mapping.questionColumns, spec.screeningQuestions),
    samples,
  }
}

export interface CommitResult {
  importId: string
  added: number
  updated: number
  duplicates: number
  emptyRows: number
  needsGlance: number
}

/**
 * Save applicants. New ones start at eligibility; existing ones (same form
 * submission id) get their answers refreshed but keep every decision made.
 */
export async function commitImport(args: {
  roleId: string
  spec: RoleSpec
  actorId: string
  sourceUrl: string
  sheet: ParsedSheet
  mapping: ColumnMapping
  questionLinks: Record<string, string>
}): Promise<CommitResult> {
  const { roleId, spec } = args
  // Validate the mapping against what's really in the sheet
  const headers = new Set(args.sheet.headers)
  for (const [f, col] of Object.entries(args.mapping.fields)) {
    if (col && !headers.has(col)) throw new ImportError(`Column "${col}" (mapped to ${f}) isn't in the sheet.`)
    if (!(FIELDS as readonly string[]).includes(f)) throw new ImportError(`Unknown field ${f}.`)
  }
  if (!args.mapping.fields.name && !args.mapping.fields.email) throw new ImportError('Map at least the Name or Email column, so candidates can be told apart.')

  const linkedCols = new Set(Object.values(args.questionLinks))
  const mapping: ColumnMapping = { ...args.mapping, questionColumns: args.mapping.questionColumns }
  const summary = buildApplicants(args.sheet, mapping)

  const people = summary.applicants.map(a => {
    const std = standardise(a.fields)
    // Answers keyed by the role's question id; unlinked question columns kept for people to read
    const answers: Record<string, string> = {}
    for (const [qid, col] of Object.entries(args.questionLinks)) if (a.answers[col]) answers[qid] = a.answers[col]
    for (const [col, v] of Object.entries(a.answers)) if (!linkedCols.has(col)) answers[`extra:${col}`] = v
    return { a, std, answers, name: a.fields.name, email: a.fields.email, phone: a.fields.phone }
  })
  const { unique, removed } = dedupeCandidates(people)

  const existing = await allRows((a, b) => db().from('candidates').select('id, external_id').eq('role_id', roleId).order('id').range(a, b))
  const byExt = new Map(existing.map(e => [e.external_id, e.id]))

  const { data: imp, error: impErr } = await db()
    .from('imports')
    .insert({
      role_id: roleId,
      source_url: args.sourceUrl,
      mapping: { ...mapping, questionLinks: args.questionLinks },
      total_rows: summary.totalRows,
      empty_rows: summary.emptyRows,
      applicants: unique.length,
      duplicates: removed.length,
      change_log: [],
      created_by: args.actorId,
    })
    .select('id')
    .single()
  if (impErr) throw impErr

  let added = 0
  let updated = 0
  let needsGlance = 0
  const newIds: string[] = []
  const rows = unique.map(p => {
    if (p.std.changes.some(c => c.check)) needsGlance++
    return {
      role_id: roleId,
      external_id: p.a.externalId,
      name: (p.a.fields.name ?? '').trim() || 'Unnamed applicant',
      email: (p.a.fields.email ?? '').trim(),
      phone: (p.a.fields.phone ?? '').trim(),
      fields: p.a.fields as Record<Field, string>,
      answers: p.answers,
      last_import_id: imp.id,
      updated_at: new Date().toISOString(),
      _std: p.std,
    }
  })

  // Existing candidates keep their scores and flags; only the import's own data is refreshed
  const parsedById = new Map<string, Record<string, unknown>>()
  if (byExt.size) {
    const cur = await allRows((a, b) => db().from('candidates').select('id, parsed').eq('role_id', roleId).order('id').range(a, b))
    for (const c of cur) parsedById.set(c.id, (c.parsed as Record<string, unknown>) ?? {})
  }
  const upserts = rows.map(({ _std, ...row }) => {
    const id = byExt.get(row.external_id)
    if (id) updated++
    else added++
    // The column says the unit ("…experience (years)"), so a bare "5" is 5 years, not a guess
    const experienceInYears = /\b(years?|yrs?)\b/i.test(args.mapping.fields.experience ?? '')
    return { ...row, parsed: { ...(id ? parsedById.get(id) : {}), standard: _std.values, changes: _std.changes, experienceInYears } }
  })
  for (let i = 0; i < upserts.length; i += 500) {
    // stage/status are not sent: new rows get the defaults, existing rows keep theirs
    const { data: saved, error } = await db().from('candidates').upsert(upserts.slice(i, i + 500), { onConflict: 'role_id,external_id' }).select('id, external_id')
    if (error) throw error
    for (const s of saved ?? []) if (!byExt.has(s.external_id)) newIds.push(s.id)
  }

  // Keep a compact change log on the import for the "What we changed" view
  const log = rows.flatMap(r => r._std.changes.map(c => ({ candidate: r.name, externalId: r.external_id, ...c })))
  await db().from('imports').update({ change_log: log }).eq('id', imp.id)

  if (newIds.length) await runEligibility(roleId, spec, newIds)
  await audit(roleId, args.actorId, 'import.committed', { added, updated, duplicates: removed.length, emptyRows: summary.emptyRows })
  return { importId: imp.id, added, updated, duplicates: removed.length, emptyRows: summary.emptyRows, needsGlance }
}

export async function listCandidates(roleId: string): Promise<CandidateRow[]> {
  return (await allRows((a, b) => db().from('candidates').select('*').eq('role_id', roleId).is('merged_into', null).order('created_at').order('id').range(a, b))) as CandidateRow[]
}
