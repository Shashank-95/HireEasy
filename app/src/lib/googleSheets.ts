interface SheetData {
  headers: string[]
  rows: Record<string, string>[]
  rawRows: string[][]
}

export function extractSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : null
}

export function inferHeaders(rows: string[][]): string[] {
  if (rows.length === 0) return []

  const firstRow = rows[0]
  const secondRow = rows.length > 1 ? rows[1] : null

  // Count how many cells in the first row look like data vs. headers
  let dataLikeCells = 0
  const totalNonEmpty = firstRow.filter(c => c.trim()).length

  for (const cell of firstRow) {
    const trimmed = cell.trim()
    if (!trimmed) continue
    const isEmail = /\S+@\S+\.\S+/.test(trimmed)
    const isPhone = /^\+?[\d\s()-]{7,15}$/.test(trimmed)
    // Pure number (not something like "Q1" or "Part 2")
    const isPureNumber = /^\d+(\.\d+)?$/.test(trimmed)
    if (isEmail || isPhone || isPureNumber) dataLikeCells++
  }

  // If majority of non-empty cells are NOT data-like, treat first row as headers
  // This is intentionally lenient — Google Forms, CSVs, and most sheets have header rows
  const dataRatio = totalNonEmpty > 0 ? dataLikeCells / totalNonEmpty : 0
  const isFirstRowHeaders = dataRatio < 0.5

  // Additional heuristic: if we have a second row, compare patterns
  // If first row is all text and second row has emails/numbers, first row is headers
  if (!isFirstRowHeaders && secondRow) {
    let secondRowDataCells = 0
    for (const cell of secondRow) {
      const trimmed = cell.trim()
      if (!trimmed) continue
      const isEmail = /\S+@\S+\.\S+/.test(trimmed)
      const isPhone = /^\+?[\d\s()-]{7,15}$/.test(trimmed)
      const isPureNumber = /^\d+(\.\d+)?$/.test(trimmed)
      if (isEmail || isPhone || isPureNumber) secondRowDataCells++
    }
    // If second row has more data-like cells, first row is probably headers
    if (secondRowDataCells > dataLikeCells) {
      return firstRow.map(h => h.trim() || 'Unnamed')
    }
  }

  if (isFirstRowHeaders) {
    return firstRow.map(h => h.trim() || 'Unnamed')
  }

  // Fallback: generate column names from data patterns
  return firstRow.map((_, i) => inferColumnName(rows.map(r => r[i] || ''), i))
}

function inferColumnName(columnValues: string[], index: number): string {
  const samples = columnValues.slice(0, 10).filter(Boolean)
  if (samples.length === 0) return `Column ${index + 1}`

  const allEmails = samples.every(v => /\S+@\S+\.\S+/.test(v))
  if (allEmails) return 'Email'

  const allPhones = samples.every(v => /^\+?[\d\s-]{7,15}$/.test(v.trim()))
  if (allPhones) return 'Phone'

  const allNumbers = samples.every(v => !isNaN(Number(v.replace(/[,₹$]/g, ''))))
  if (allNumbers) {
    const avg = samples.reduce((a, v) => a + Number(v.replace(/[,₹$]/g, '')), 0) / samples.length
    if (avg > 100000) return 'CTC/Salary'
    if (avg > 0 && avg < 50) return 'Experience (Years)'
    return `Numeric ${index + 1}`
  }

  const allUrls = samples.every(v => /^https?:\/\//.test(v.trim()))
  if (allUrls) return 'Resume/Link'

  const allShort = samples.every(v => v.trim().split(/\s+/).length <= 4)
  if (allShort && index === 0) return 'Name'

  const avgLength = samples.reduce((a, v) => a + v.length, 0) / samples.length
  if (avgLength > 100) return `Response ${index + 1}`

  return `Column ${index + 1}`
}

export function parseSheetData(rawData: string[][]): SheetData {
  if (rawData.length === 0) return { headers: [], rows: [], rawRows: [] }

  const headers = inferHeaders(rawData)
  // Check if first row is the header by comparing each element
  const firstRowTrimmed = rawData[0].map(h => h.trim() || 'Unnamed')
  const isFirstRowHeader = headers.length === firstRowTrimmed.length &&
    headers.every((h, i) => h === firstRowTrimmed[i])
  const dataStartRow = isFirstRowHeader ? 1 : 0
  const dataRows = rawData.slice(dataStartRow)

  const rows = dataRows.map(row => {
    const record: Record<string, string> = {}
    headers.forEach((header, i) => {
      record[header] = row[i] || ''
    })
    return record
  })

  return { headers, rows, rawRows: dataRows }
}

export function identifyKeyColumns(headers: string[]): {
  nameColumn: string | null
  emailColumn: string | null
  phoneColumn: string | null
  resumeColumn: string | null
  responseColumns: string[]
} {
  const lower = headers.map(h => h.toLowerCase())

  const nameColumn = headers[lower.findIndex(h => h.includes('name'))] || null
  const emailColumn = headers[lower.findIndex(h => h.includes('email') || h.includes('mail'))] || null
  const phoneColumn = headers[lower.findIndex(h => h.includes('phone') || h.includes('mobile') || h.includes('contact'))] || null
  const resumeColumn = headers[lower.findIndex(h => h.includes('resume') || h.includes('cv') || h.includes('link'))] || null

  const metaColumns = new Set([nameColumn, emailColumn, phoneColumn, resumeColumn].filter(Boolean))
  const responseColumns = headers.filter(h => !metaColumns.has(h) && !h.toLowerCase().includes('timestamp'))

  return { nameColumn, emailColumn, phoneColumn, resumeColumn, responseColumns }
}
