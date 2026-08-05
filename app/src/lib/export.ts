import { Candidate } from '../stores/jobStore'
import { FILTER_LABELS } from './screeningFilters'
import { formatCtc, formatExperience, formatNotice } from './candidateParsing'

/**
 * Full audit export. Every column a recruiter needs to defend a decision:
 * structured attributes, scores, percentiles, tier, red flags and the AI's reasoning.
 */
const COLUMNS: { header: string; get: (c: Candidate) => string | number }[] = [
  { header: 'Name', get: c => c.name },
  { header: 'Email', get: c => c.email || '' },
  { header: 'Phone', get: c => c.phone || '' },
  { header: 'Location', get: c => c.location || '' },
  { header: 'Expected CTC', get: c => formatCtc(c.ctcExpected) },
  { header: 'CTC (LPA)', get: c => c.ctcExpected ?? '' },
  { header: 'Experience', get: c => formatExperience(c.experienceYears) },
  { header: 'Experience (yrs)', get: c => c.experienceYears ?? '' },
  { header: 'Notice Period', get: c => formatNotice(c.noticePeriodDays) },
  { header: 'Status', get: c => c.status },
  { header: 'Tier', get: c => c.screeningDetail?.tier || '' },
  { header: 'L1 Score', get: c => c.l1Score ?? '' },
  { header: 'L1 Percentile', get: c => c.l1Percentile ?? '' },
  { header: 'L2 Score', get: c => c.l2Score ?? '' },
  { header: 'Final Score', get: c => c.finalScore ?? '' },
  { header: 'AI Detection %', get: c => c.aiDetectionScore ?? '' },
  { header: 'Filtered Reasons', get: c => (c.filterFailures || []).map(f => FILTER_LABELS[f] || f).join('; ') },
  { header: 'Red Flags', get: c => (c.screeningDetail?.redFlags || []).join('; ') },
  { header: 'Strengths', get: c => (c.screeningDetail?.topStrengths || []).join('; ') },
  { header: 'Concerns', get: c => (c.screeningDetail?.concerns || []).join('; ') },
  { header: 'AI Summary', get: c => c.screeningDetail?.summary || '' },
  { header: 'Manual Override', get: c => c.manualDecision || '' },
  { header: 'Interview Score', get: c => c.interviewScore ?? '' },
  { header: 'Resume URL', get: c => c.resumeUrl || '' },
  { header: 'Scoring Error', get: c => c.screeningDetail?.error || '' },
]

function buildRows(candidates: Candidate[]): (string | number)[][] {
  return candidates.map(c => COLUMNS.map(col => col.get(c)))
}

export function exportToCsv(candidates: Candidate[], filename: string): void {
  const headers = COLUMNS.map(c => c.header)
  const rows = buildRows(candidates)

  const csvContent = [
    headers.join(','),
    ...rows.map(row =>
      row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
    ),
  ].join('\n')

  // BOM so Excel opens UTF-8 (₹, accented names) correctly
  downloadBlob('﻿' + csvContent, `${filename}.csv`, 'text/csv;charset=utf-8')
}

export function exportToExcel(candidates: Candidate[], filename: string): void {
  const headers = COLUMNS.map(c => c.header)
  const rows = buildRows(candidates)

  import('xlsx')
    .then(XLSX => {
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])

      // Widen the free-text columns so the export is readable without fiddling
      ws['!cols'] = headers.map(h =>
        ['AI Summary', 'Strengths', 'Concerns', 'Scoring Error'].includes(h) ? { wch: 60 }
          : ['Filtered Reasons', 'Red Flags', 'Email', 'Resume URL'].includes(h) ? { wch: 32 }
          : { wch: 16 }
      )
      ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: headers.length - 1 } }) }
      ws['!freeze'] = { xSplit: 1, ySplit: 1 }

      XLSX.utils.book_append_sheet(wb, ws, 'Candidates')
      XLSX.writeFile(wb, `${filename}.xlsx`)
    })
    .catch(() => exportToCsv(candidates, filename))
}

function downloadBlob(content: string, filename: string, type: string): void {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
