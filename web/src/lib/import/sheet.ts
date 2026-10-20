import Papa from 'papaparse'
import type { ColumnMapping, Field } from './mapping'

/**
 * Turn any Google Sheets link into its CSV export URL, keeping the tab (gid).
 * A sheet's first tab is often not the one with the responses.
 */
export function sheetCsvUrl(link: string): string | null {
  const id = link.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1]
  if (!id) return null
  const gid = link.match(/[#?&]gid=(\d+)/)?.[1]
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? `&gid=${gid}` : ''}`
}

export interface ParsedSheet {
  headers: string[]
  rows: Record<string, string>[]
}

/** Papaparse, because answers contain commas, quotes and line breaks. */
export function parseCsv(csv: string): ParsedSheet {
  const result = Papa.parse<string[]>(csv.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' })
  const [headerRow = [], ...data] = result.data
  // Blank or repeated headers would overwrite each other's values
  const seen = new Map<string, number>()
  const headers = headerRow.map((h, i) => {
    const base = h.trim() || `Column ${i + 1}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return n > 1 ? `${base} (${n})` : base
  })
  const rows = data.map(cells => Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? '').trim()])))
  return { headers, rows }
}

export interface ImportedApplicant {
  /** Stable key for re-imports: the form's own submission id, or the row number */
  externalId: string
  fields: Partial<Record<Field, string>>
  /** Screening answers keyed by the sheet's question column */
  answers: Record<string, string>
}

export interface ImportSummary {
  applicants: ImportedApplicant[]
  totalRows: number
  /** Form submissions with no applicant data — Typeform logs abandoned starts */
  emptyRows: number
}

/**
 * Build applicants from the confirmed mapping. A row counts only if it has a
 * name, email or at least one answer: the test sheet has 1,247 rows of which
 * 946 are empty submissions carrying just a timestamp and token.
 */
export function buildApplicants(sheet: ParsedSheet, mapping: ColumnMapping): ImportSummary {
  const applicants: ImportedApplicant[] = []
  let emptyRows = 0

  sheet.rows.forEach((row, i) => {
    const fields: Partial<Record<Field, string>> = {}
    for (const [field, col] of Object.entries(mapping.fields) as [Field, string][]) {
      if (col && row[col]) fields[field] = row[col]
    }
    const answers: Record<string, string> = {}
    for (const col of mapping.questionColumns) {
      if (row[col]) answers[col] = row[col]
    }

    const hasPerson = !!(fields.name || fields.email || fields.phone)
    if (!hasPerson && Object.keys(answers).length === 0) {
      emptyRows++
      return
    }
    applicants.push({ externalId: fields.externalId || `row-${i + 2}`, fields, answers })
  })

  return { applicants, totalRows: sheet.rows.length, emptyRows }
}
