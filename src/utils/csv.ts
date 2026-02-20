const COMMON_TERM_COLUMNS = [
  'Customer Search Term',
  'Search term',
  'Search Term',
  'Query',
  'Keyword',
]

export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let current: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
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
    if (c === '\r' && text[i + 1] === '\n') {
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

export function detectSearchTermColumn(headers: string[]): number {
  const lower = headers.map((h) => h.trim().toLowerCase())
  for (const name of COMMON_TERM_COLUMNS) {
    const idx = lower.indexOf(name.toLowerCase())
    if (idx !== -1) return idx
  }
  return 0
}

export function getColumnOptions(rows: string[][]): string[] {
  if (rows.length === 0) return []
  return rows[0].map((h, i) => (h?.trim() || `Column ${i + 1}`))
}
