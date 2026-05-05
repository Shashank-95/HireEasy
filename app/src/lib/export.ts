import { Candidate } from '../stores/jobStore'

export function exportToCsv(candidates: Candidate[], filename: string): void {
  const headers = ['Name', 'Email', 'Phone', 'Status', 'AI Detection Score', 'L1 Score', 'L2 Score', 'Final Score']
  const rows = candidates.map(c => [
    c.name,
    c.email || '',
    c.phone || '',
    c.status,
    c.aiDetectionScore?.toString() || '',
    c.l1Score?.toString() || '',
    c.l2Score?.toString() || '',
    c.finalScore?.toString() || '',
  ])

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')),
  ].join('\n')

  downloadBlob(csvContent, `${filename}.csv`, 'text/csv')
}

export function exportToExcel(candidates: Candidate[], filename: string): void {
  // Use simple CSV with .xlsx extension for compatibility
  // In production, use the xlsx library for proper Excel files
  const headers = ['Name', 'Email', 'Phone', 'Status', 'AI Score', 'L1 Score', 'L2 Score', 'Final Score', 'Resume URL']
  const rows = candidates.map(c => [
    c.name,
    c.email || '',
    c.phone || '',
    c.status,
    c.aiDetectionScore ?? '',
    c.l1Score ?? '',
    c.l2Score ?? '',
    c.finalScore ?? '',
    c.resumeUrl || '',
  ])

  try {
    // Try using xlsx library if available
    import('xlsx').then(XLSX => {
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])

      // Set column widths
      ws['!cols'] = headers.map(() => ({ wch: 18 }))

      XLSX.utils.book_append_sheet(wb, ws, 'Candidates')
      XLSX.writeFile(wb, `${filename}.xlsx`)
    }).catch(() => {
      // Fallback to CSV
      exportToCsv(candidates, filename)
    })
  } catch {
    exportToCsv(candidates, filename)
  }
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
