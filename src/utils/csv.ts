import type { MatchTargetKind } from '../types'

const COMMON_TERM_COLUMNS = [
  'Customer Search Term',
  'Matched product',
  'Search term',
  'Search Term',
  'Query',
  'Keyword',
]

/** Target/match column for within-file dedup: Keywords (keyword reports) before Product targets (product reports). */
export function detectMatchTargetColumn(headers: string[]): number {
  const cells = headers.map((h) => normalizeHeaderCell(h))
  for (let i = 0; i < cells.length; i++) {
    const h = cells[i]
    if (h === 'keywords' || h === 'keyword') return i
  }
  for (let i = 0; i < cells.length; i++) {
    const h = cells[i]
    if (h === 'product targets' || h === 'product target') return i
  }
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === 'targeting') return i
  }
  return -1
}

export function classifyMatchTargetColumn(headers: string[], col: number): MatchTargetKind | undefined {
  if (col < 0) return undefined
  const h = normalizeHeaderCell(headers[col] ?? '')
  if (h === 'keywords' || h === 'keyword') return 'keywords'
  if (h === 'product targets' || h === 'product target') return 'product-targets'
  if (h === 'targeting') return 'targeting'
  return undefined
}

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

export function resolveTermColumnForFile(
  rows: string[][],
  referenceHeaders: string[],
  referenceColumnIndex: number
): number {
  const headerRow = findSearchTermReportHeaderRow(rows)
  const headers = rows[headerRow] ?? rows[0] ?? []
  const refNorm = normalizeHeaderCell(referenceHeaders[referenceColumnIndex] ?? '')
  if (refNorm) {
    for (let i = 0; i < headers.length; i++) {
      if (normalizeHeaderCell(headers[i] ?? '') === refNorm) return i
    }
  }
  return detectSearchTermColumn(headers)
}

export function detectSearchTermColumn(headers: string[]): number {
  const idx = findSearchTermColumnIndex(headers)
  return idx >= 0 ? idx : 0
}

/** Upload modal hint: SP product-targeting reports use Matched product instead of Customer Search Term. */
export function termColumnSelectionHint(headers: string[]): string {
  const lower = headers.map((h) => normalizeHeaderCell(h))
  if (lower.some((cell) => cell === 'matched product')) {
    return 'Select the column that contains matched products or search terms (Matched product or Customer Search Term):'
  }
  return 'Select the column that contains search terms:'
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

/** Drop Amazon report title rows so row 0 is the real header (matches Campaign Input / dedup). */
export function normalizeSearchTermReportRows(rows: string[][]): string[][] {
  if (rows.length === 0) return rows
  const headerRow = findSearchTermReportHeaderRow(rows)
  return headerRow > 0 ? rows.slice(headerRow) : rows
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
 * Order / purchase count column — not revenue ("Sales" dollars), not sales rank.
 * Matches Purchases, Orders, 7 Day Total Orders, etc.
 */
export function detectPurchasesColumn(headers: string[]): number {
  if (!headers?.length) return -1
  const cells = headers.map((h) => normalizeHeaderCell(h))
  for (let i = 0; i < cells.length; i++) {
    const h = cells[i]
    if (h === 'purchases' || h === 'purchase') return i
  }
  for (let i = 0; i < cells.length; i++) {
    const h = cells[i]
    if (/\b(7|14|30|\d+)\s*day\s*total\s*orders?\b/i.test(h)) return i
  }
  for (let i = 0; i < cells.length; i++) {
    const h = cells[i]
    if (/\battributed\s*orders?\b/i.test(h)) return i
  }
  for (let i = 0; i < cells.length; i++) {
    const h = cells[i]
    if (/\bunits?\s*ordered\b/i.test(h)) return i
  }
  for (let i = 0; i < cells.length; i++) {
    const h = cells[i]
    const lettersOnly = h.replace(/[^a-z]/g, '')
    if (lettersOnly === 'orders' || lettersOnly === 'order') return i
  }
  for (let i = 0; i < cells.length; i++) {
    const h = cells[i]
    if (!/\borders?\b/.test(h)) continue
    if (/\border\s*(id|#|number)\b|sales\s*rank/i.test(h)) continue
    return i
  }
  return -1
}

function isExcludedSpendHeader(h: string): boolean {
  return /cpc|cost\s*per\s*click|cost\s*per|per\s*click|vcpm|ctr|acos|roas|fee\s*only/i.test(h)
}

/** Ad spend / cost column (currency), not CPC. */
export function detectSpendColumn(headers: string[]): number {
  if (!headers?.length) return -1
  const cells = headers.map((h) => normalizeHeaderCell(h))
  for (let i = 0; i < cells.length; i++) {
    const h = cells[i]
    if (h === 'spend') return i
  }
  for (let i = 0; i < cells.length; i++) {
    const h = cells[i]
    if (/\btotal\s*spend\b/.test(h)) return i
  }
  for (let i = 0; i < cells.length; i++) {
    const h = cells[i]
    if (/\btotal\s*cost\b/.test(h) && !isExcludedSpendHeader(h)) return i
  }
  for (let i = 0; i < cells.length; i++) {
    const h = cells[i]
    const lettersOnly = h.replace(/[^a-z]/g, '')
    if (lettersOnly === 'spend') return i
  }
  for (let i = 0; i < cells.length; i++) {
    const h = cells[i]
    if (!/\b(spend|cost)\b/.test(h)) continue
    if (isExcludedSpendHeader(h)) continue
    if (/rank|sku|asin|fee\s*only|tax\b/i.test(h)) continue
    return i
  }
  return -1
}

/** Attributed sales revenue (currency) for ACOS — not sales rank, not ACoS %, not order counts. */
export function detectAttributedSalesColumn(headers: string[]): number {
  if (!headers?.length) return -1
  const cells = headers.map((h) => normalizeHeaderCell(h))
  for (let i = 0; i < cells.length; i++) {
    const h = cells[i]
    if (h === 'sales' || h === 'sale') return i
  }
  for (let i = 0; i < cells.length; i++) {
    const h = cells[i]
    const lettersOnly = h.replace(/[^a-z]/g, '')
    if (lettersOnly === 'sales' || lettersOnly === 'sale') return i
  }
  for (let i = 0; i < cells.length; i++) {
    const h = cells[i]
    if (/\b(14|7|30|\d+)\s*day.*\bsales\b|\battributed.*sales\b|\btotal\s*sales\b/i.test(h)) {
      if (/cost|acos|a.?co.?s|advertising\s*cost|rank|tax\b/i.test(h)) continue
      return i
    }
  }
  for (let i = 0; i < cells.length; i++) {
    const h = cells[i]
    if (!/\bsales\b/.test(h)) continue
    if (/rank|velocity|cost\s*of|advertising\s*cost|acos|fee\s*only/i.test(h)) continue
    return i
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
