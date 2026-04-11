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

/** Trim, BOM, quotes, lowercase — for matching Amazon report headers. */
export function normalizeHeaderCell(h: string): string {
  return (h || '')
    .replace(/^\ufeff/g, '')
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

export function detectSearchTermColumn(headers: string[]): number {
  const idx = findSearchTermColumnIndex(headers)
  return idx >= 0 ? idx : 0
}

/** Index of the search-term column, or -1 if no known header matches. */
export function findSearchTermColumnIndex(headers: string[]): number {
  const lower = headers.map((h) => normalizeHeaderCell(h))
  for (let i = 0; i < lower.length; i++) {
    const cell = lower[i]
    for (const name of COMMON_TERM_COLUMNS) {
      const target = name.toLowerCase()
      if (cell === target) return i
    }
  }
  for (let i = 0; i < lower.length; i++) {
    const cell = lower[i]
    if (cell.startsWith('customer search term')) return i
  }
  const targeting = lower.findIndex((cell) => cell === 'targeting')
  if (targeting !== -1) return targeting
  return -1
}

/**
 * First row that looks like an Amazon / bulk search-term table header:
 * has a recognizable term column and a Clicks metric column.
 * Many exports prepend title rows before the real header — row 0 is often wrong.
 */
export function findSearchTermReportHeaderRow(rows: string[][], maxScan = 40): number {
  const max = Math.min(maxScan, rows.length)
  for (let i = 0; i < max; i++) {
    const r = rows[i]
    if (!r?.length || r.length < 3) continue
    const termIdx = findSearchTermColumnIndex(r)
    const clickIdx = detectClicksColumn(r)
    if (termIdx >= 0 && clickIdx >= 0) return i
  }
  for (let i = 0; i < max; i++) {
    const r = rows[i]
    if (r?.length && detectClicksColumn(r) >= 0) return i
  }
  return 0
}

export function getColumnOptions(rows: string[][], headerRowIndex?: number): string[] {
  if (rows.length === 0) return []
  const idx = headerRowIndex ?? findSearchTermReportHeaderRow(rows)
  const header = rows[idx] ?? rows[0]
  return header.map((h, i) => (h?.trim() || `Column ${i + 1}`))
}

function isExcludedClicksHeader(h: string): boolean {
  if (/click.?thr(u)?|click.?through|through.?rate|impression.?share/.test(h)) return true
  if (/\bctr\b/.test(h)) return true
  if (/cost\s*per\s*click|cost-per-click/.test(h)) return true
  if (/\bcpc\b/.test(h) && !/\bclicks?\b/.test(h)) return true
  if (h.includes('viewable') && h.includes('click')) return true
  return false
}

/**
 * Column index for the **click count** metric (not CPC, not CTR, not click-through rate).
 */
export function detectClicksColumn(headers: string[]): number {
  if (!headers?.length) return -1
  const cells = headers.map((h) => normalizeHeaderCell(h))

  for (let i = 0; i < cells.length; i++) {
    const h = cells[i]
    if (h === 'clicks' || h === 'click') return i
  }
  for (let i = 0; i < cells.length; i++) {
    const h = cells[i]
    if (/^clicks?\s*(\(|$|\[)/.test(h) || /^clicks?\s+\d/.test(h)) return i
  }
  for (let i = 0; i < cells.length; i++) {
    const h = cells[i]
    if (!/\bclicks?\b/.test(h)) continue
    if (isExcludedClicksHeader(h)) continue
    return i
  }
  return -1
}

export function parseCsvNumber(val: string | undefined): number {
  let s = String(val ?? '').trim()
  s = s.replace(/[$,£€\s%]/g, '')
  s = s.replace(/,/g, '')
  if (!s) return 0
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}
