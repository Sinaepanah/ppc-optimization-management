/**
 * SQP CSV Parser
 * Amazon Brand Analytics "Search Query Performance" CSV format.
 * Header detection: If row[0] contains "Search Query" → headerRow=0, else headerRow=1.
 * Data begins immediately after headerRow.
 */

export interface SQPParseResult {
  headers: string[]
  rows: Record<string, string | number>[]
  rawRows: string[][]
}

export interface SQPParseError {
  message: string
  detail?: string
}

function trimCell(s: string): string {
  return (s || '').replace(/\ufeff/g, '').trim()
}

function rowContains(row: string[], sub: string): boolean {
  const joined = row.map((c) => trimCell(c)).join(' ')
  return joined.includes(sub)
}

/** Parse entire CSV into rows; handles quoted values, commas and newlines inside quotes */
function parseCSVRaw(text: string): string[][] {
  const raw = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const rows: string[][] = []
  let current: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (inQuotes) {
      if (c === '"') {
        if (raw[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += c
      }
      continue
    }
    if (c === '"') {
      inQuotes = true
      continue
    }
    if (c === ',' || c === '\t') {
      current.push(cell)
      cell = ''
      continue
    }
    if (c === '\r' && raw[i + 1] === '\n') {
      i++
      current.push(cell)
      rows.push(current)
      current = []
      cell = ''
      continue
    }
    if (c === '\n' || c === '\r') {
      current.push(cell)
      rows.push(current)
      current = []
      cell = ''
      continue
    }
    cell += c
  }
  current.push(cell)
  rows.push(current)
  return rows
}

export function parseSQPCsv(text: string): SQPParseResult | SQPParseError {
  if (typeof text !== 'string' || !text.trim()) {
    return { message: 'No file content provided' }
  }

  const allRows = parseCSVRaw(text)
  if (allRows.length < 1) {
    return { message: 'No data found', detail: 'File is empty.' }
  }
  if (allRows.length < 2) {
    return { message: 'No data found after header row', detail: 'Need at least 2 rows (header + data).' }
  }

  const headerRowIndexInAll = rowContains(allRows[0], 'Search Query') ? 0 : 1
  const headerRow = allRows[headerRowIndexInAll]
  const headers = headerRow.map((h) => trimCell(h))

  const dataRows: string[][] = []
  for (let i = headerRowIndexInAll + 1; i < allRows.length; i++) {
    const row = allRows[i]
    const isBlank = row.every((c) => !trimCell(c))
    if (isBlank) continue
    dataRows.push(row)
  }

  if (dataRows.length === 0) {
    return { message: 'No data found after header row', detail: 'No data rows found.' }
  }

  const rows: Record<string, string | number>[] = []
  const rawRows: string[][] = []
  for (const dr of dataRows) {
    const obj: Record<string, string | number> = {}
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j] || `Column${j + 1}`
      const val = trimCell(dr[j] ?? '')
      obj[key] = val
    }
    rows.push(obj)
    rawRows.push(dr)
  }

  return { headers, rows, rawRows }
}
