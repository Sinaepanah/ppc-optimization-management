const COMMON_TERM_COLUMNS = [
  'Customer Search Term',
  'Search term',
  'Search Term',
  'Query',
  'Keyword',
]

/** Prefer tab, then semicolon (EU Excel), else comma. */
export function detectDelimiter(text: string): ',' | '\t' | ';' {
  const head = text.slice(0, Math.min(text.length, 12000))
  const firstLine = head.split(/\r?\n/).find((l) => l.trim().length > 0) ?? ''
  const tab = (firstLine.match(/\t/g) ?? []).length
  const semi = (firstLine.match(/;/g) ?? []).length
  const comma = (firstLine.match(/,/g) ?? []).length
  if (tab > 0 && tab >= semi && tab >= comma) return '\t'
  if (semi > comma) return ';'
  return ','
}

function isFieldSep(c: string, sep: ',' | '\t' | ';'): boolean {
  if (sep === '\t') return c === '\t'
  if (sep === ';') return c === ';'
  return c === ',' || c === '\t'
}

/** RFC4180-style parse with configurable separator (comma, tab, or semicolon). */
export function parseDelimitedText(text: string, sep: ',' | '\t' | ';'): string[][] {
  if (typeof text !== 'string' || !text.length) return []
  let raw = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  raw = raw.replace(/^\ufeff/g, '')
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
    if (isFieldSep(c, sep)) {
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

export function parseCSV(text: string): string[][] {
  if (typeof text !== 'string' || !text.length) return []
  const sep = detectDelimiter(text)
  return parseDelimitedText(text, sep)
}

/** Trim, BOM, quotes, lowercase — for matching Amazon report headers. */
export function normalizeHeaderCell(h: string): string {
  return (h || '')
    .replace(/^\ufeff/g, '')
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/^["'\s]+|["'\s]+$/g, '')
    .replace(/^\[|\]$/g, '')
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
  for (let i = 0; i < lower.length; i++) {
    const cell = lower[i]
    if (cell.includes('customer search term')) return i
    if (
      (cell === 'search term' ||
        (cell.startsWith('search term') &&
          !/rank|share|impression|volume|popularity|score|index/i.test(cell))) &&
      !cell.includes('impression')
    ) {
      return i
    }
  }
  return -1
}

/**
 * Pick the header row: prefer the **widest** row that has a Clicks column (Amazon often prepends
 * narrow title rows; the real header has many columns). If none, fall back to 0.
 */
export function findSearchTermReportHeaderRow(rows: string[][], maxScan = 80): number {
  const max = Math.min(maxScan, rows.length)
  let bestIdx = -1
  let bestWidth = -1
  for (let i = 0; i < max; i++) {
    const r = rows[i]
    if (!r?.length) continue
    if (detectClicksColumn(r) < 0) continue
    if (r.length > bestWidth) {
      bestWidth = r.length
      bestIdx = i
    }
  }
  if (bestIdx >= 0) return bestIdx
  for (let i = 0; i < max; i++) {
    const r = rows[i]
    if (!r?.length || r.length < 3) continue
    const termIdx = findSearchTermColumnIndex(r)
    const clickIdx = detectClicksColumn(r)
    if (termIdx >= 0 && clickIdx >= 0) return i
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
    const lettersOnly = h.replace(/[^a-z]/g, '')
    if (lettersOnly === 'clicks' || lettersOnly === 'click') return i
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
  for (let i = 0; i < cells.length; i++) {
    const h = cells[i]
    if (/total.*clicks?|clicks?.*\(/.test(h) && !isExcludedClicksHeader(h)) return i
  }
  for (let i = 0; i < headers.length; i++) {
    const raw = (headers[i] ?? '').trim()
    if (/^clicks?$/i.test(raw) || /^[\d\s\-–—daywk]+clicks?$/i.test(normalizeHeaderCell(raw))) {
      if (!isExcludedClicksHeader(normalizeHeaderCell(raw))) return i
    }
  }
  return -1
}

/**
 * When header-based detection fails or reads an empty column, pick the column whose numeric sample
 * sums highest (excluding obvious term/campaign/money columns). Prefer headers containing "click".
 */
export function inferClicksColumnFromSample(
  headers: string[],
  dataRows: string[][],
  termCol: number,
  width: number
): number {
  const bad =
    /customer|search\s*term|query|keyword|targeting|^campaign|ad\s*group|portfolio|match|currency|state|start|end|date$/i
  let bestJ = -1
  let bestScore = -1
  for (let j = 0; j < Math.min(width, headers.length); j++) {
    if (j === termCol) continue
    const hn = normalizeHeaderCell(headers[j] ?? '')
    if (bad.test(hn)) continue
    if (
      /^impressions?$|^spend|sales|order|purchases?|units|acos|roas|cpc|rpc|budget|bid|sku|asin|cost|fee|ctr|delivery|placement|portfolio|impression|cpm|vcpm|conversion/i.test(
        hn
      )
    ) {
      continue
    }
    let sum = 0
    let nz = 0
    for (let r = 0; r < Math.min(150, dataRows.length); r++) {
      const row = dataRows[r]
      if (!row?.length) continue
      const pad = row.length < width ? [...row, ...Array(width - row.length).fill('')] : row
      const v = parseCsvNumber(getCsvCell(pad, j))
      if (v > 0) nz++
      if (v >= 0 && v < 100_000_000) sum += v
    }
    const clickBonus = /\bclicks?\b|attributed.*click/i.test(hn) ? 1_000_000_000 : 0
    const score = sum * 8 + nz * 25 + clickBonus
    if (score > bestScore) {
      bestScore = score
      bestJ = j
    }
  }
  if (bestJ < 0 || bestScore <= 0) return -1
  return bestJ
}

/** Read cell at index; do not snap to last column when short (avoids reading Spend/CPC as Clicks). */
export function getCsvCell(row: string[] | undefined | null, col: number): string {
  if (!row || col < 0) return ''
  if (col >= row.length) return ''
  return row[col] ?? ''
}

export function parseCsvNumber(val: string | undefined): number {
  let s = String(val ?? '').trim()
  if (/^[-–—]+$|^n\/?a$/i.test(s)) return 0
  s = s.replace(/[$,£€\s%\u00a0]/g, '')
  s = s.replace(/,/g, '')
  if (!s) return 0
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}
