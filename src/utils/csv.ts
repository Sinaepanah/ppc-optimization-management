const COMMON_TERM_COLUMNS = [
  'Customer Search Term',
  'Search term',
  'Search Term',
  'Query',
  'Keyword',
]

export function parseCSV(text: string): string[][] {
  if (typeof text !== 'string') return []
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

export function detectSearchTermColumn(headers: string[]): number {
  const lower = headers.map((h) => (h || '').replace(/\ufeff/g, '').trim().toLowerCase())
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

/** Column index for bulk report "Clicks", or -1 if not found. */
export function detectClicksColumn(headers: string[]): number {
  const lower = headers.map((h) => (h || '').replace(/\ufeff/g, '').trim().toLowerCase())
  for (let i = 0; i < lower.length; i++) {
    const h = lower[i]
    if (h === 'clicks' || h === 'click') return i
  }
  const idx = lower.findIndex((h) => h.includes('click') && !h.includes('through') && !h.includes('ctr'))
  return idx >= 0 ? idx : -1
}

export function parseCsvNumber(val: string | undefined): number {
  const s = String(val ?? '').trim().replace(/[$,£€\s]/g, '')
  if (!s) return 0
  const n = parseFloat(s.replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}
