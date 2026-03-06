/**
 * Parse placement-level PPC data from Amazon Campaign Manager screenshots.
 * 4x11 table: header + 3 data rows (Top of search, Rest of search, Product pages).
 * Uses column-based position mapping and OCR correction for accuracy.
 */

export interface PlacementRow {
  placementName: string
  bidAdjustment: string
  impressions: string
  clicks: string
  ctr: string
  totalCost: string
  cpc: string
  purchases: string
  sales: string
  acos: string
}

export interface ExtractedPlacementData {
  topOfSearch: PlacementRow
  restOfSearch: PlacementRow
  productPages: PlacementRow
}

interface TsvWord {
  left: number
  top: number
  width: number
  height: number
  text: string
  lineNum?: number
  blockNum?: number
}

const EMPTY = /^[—\-–\s]*$/

/** Fix common OCR misreads for numbers (impressions, clicks, purchases) */
function fixOcrNumber(raw: string): string {
  let s = raw.trim().replace(/\s/g, '')
  if (EMPTY.test(s)) return ''
  if (s.includes(',')) return s
  if (/^\d+\.(\d{3})$/.test(s)) {
    const m = s.match(/^(\d+)\.(\d{3})$/)!
    return `${m[1]},${m[2]}`
  }
  if (/^\d+\.\d{1,2}$/.test(s) && parseFloat(s) < 1000) return s
  if (/^\d{2,}$/.test(s) && parseInt(s, 10) < 1000000) return s.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return s
}

/** Accept $ or £ from Amazon US/UK; normalize to $ for internal use */
function fixOcrCurrency(raw: string): string {
  let s = raw.trim().replace(/\s/g, '')
  if (EMPTY.test(s)) return ''
  const m = s.match(/[\$£]?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+\.?\d*)/)
  if (!m) return s
  let num = m[1].replace(/,/g, '')
  if (/^\d{3,6}$/.test(num) && !num.includes('.')) {
    const n = parseInt(num, 10)
    if (n >= 100 && n < 100000) num = (n / 100).toFixed(2)
  }
  const parsed = parseFloat(num)
  return isNaN(parsed) ? s : `$${parsed.toFixed(2)}`
}

function fixOcrPercent(raw: string): string {
  let s = raw.trim().replace(/\s/g, '')
  if (EMPTY.test(s)) return ''
  const m = s.match(/(\d+)(?:\.(\d+))?%?/)
  if (!m) return s
  let [whole, frac = ''] = [m[1], m[2] ?? '']
  if (whole.length >= 3 && !frac) {
    const last2 = whole.slice(-2)
    whole = whole.slice(0, -2)
    frac = last2
  }
  const val = frac ? `${whole}.${frac}` : whole
  return s.includes('%') ? `${val}%` : `${val}%`
}

/** ACOS: 0.4216 (decimal) → 42.16, 42.16 (percent) → 42.16 */
function fixOcrAcos(raw: string): string {
  const s = fixOcrPercent(raw)
  if (!s) return ''
  const n = parseFloat(s.replace(/%/g, ''))
  if (isNaN(n)) return s.replace(/%/g, '')
  const pct = n > 0 && n < 1 ? n * 100 : n
  return String(pct)
}

function parseTsvWords(tsv: string): TsvWord[] {
  const lines = tsv.trim().split(/\r?\n/)
  const words: TsvWord[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t')
    if (cols.length < 12) continue
    const level = parseInt(cols[0], 10)
    if (level !== 5) continue
    const text = (cols[11] ?? '').trim()
    if (!text) continue
    words.push({
      left: parseInt(cols[6], 10) || 0,
      top: parseInt(cols[7], 10) || 0,
      width: parseInt(cols[8], 10) || 0,
      height: parseInt(cols[9], 10) || 0,
      text,
      lineNum: parseInt(cols[4], 10),
      blockNum: parseInt(cols[2], 10),
    })
  }
  return words
}

function emptyRow(placementName: string): PlacementRow {
  return {
    placementName,
    bidAdjustment: '',
    impressions: '',
    clicks: '',
    ctr: '',
    totalCost: '',
    cpc: '',
    purchases: '',
    sales: '',
    acos: '',
  }
}

/**
 * Identify placement type from row words.
 * Uses the label portion (words before first data value) for accuracy.
 * Amazon order: Top of search (first page), Rest of search, Product pages.
 */
function identifyPlacementType(rowWords: TsvWord[]): 'top' | 'rest' | 'product' | null {
  const sorted = [...rowWords].sort((a, b) => a.left - b.left)
  const labelWords: string[] = []
  for (const w of sorted) {
    const t = w.text.trim()
    if (
      /^\d+%$/.test(t) ||
      /^[\d,]+$/.test(t) ||
      /^\d+$/.test(t) ||
      /^[\$£][\d,.]+$/.test(t) ||
      /^[\d.]+%$/.test(t) ||
      EMPTY.test(t)
    ) {
      break
    }
    labelWords.push(t.toLowerCase())
  }
  const text = labelWords.join(' ')
  if (!text) return null
  if (text.includes('product') && text.includes('pages')) return 'product'
  if (text.includes('rest') && text.includes('search')) return 'rest'
  if ((text.includes('top') || text.includes('first')) && text.includes('search')) return 'top'
  return null
}

/** Check if a row contains data (numbers, $, %, —) not just headers */
function isDataRow(words: TsvWord[]): boolean {
  return words.some(
    (w) =>
      /^[\$£][\d,.]+$/.test(w.text) ||
      /^[\d,]+$/.test(w.text) ||
      /^\d+%$/.test(w.text) ||
      /^[\d.]+%$/.test(w.text) ||
      /^\d+$/.test(w.text) ||
      EMPTY.test(w.text)
  )
}

/** Check if a row is a header row (only labels, no data values) */
function isHeaderRow(words: TsvWord[]): boolean {
  const hasData = words.some(
    (w) =>
      /^[\$£][\d,.]+$/.test(w.text) ||
      /^[\d,]+$/.test(w.text) ||
      /^\d+%$/.test(w.text) ||
      /^[\d.]+%$/.test(w.text) ||
      /^\d+$/.test(w.text)
  )
  return !hasData
}

/**
 * Extract values from a data row using column position.
 * Data columns (after placement name + strategy): bid adj, imp, clicks, ctr, cost, cpc, purch, sales, acos
 */
function extractRowByPosition(words: TsvWord[]): Partial<PlacementRow> {
  const sorted = [...words].sort((a, b) => a.left - b.left)
  const values: string[] = []

  let dataStart = -1
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i].text.trim()
    if (
      /^\d+%$/.test(t) ||
      /^[\d,]+$/.test(t) ||
      /^\d+$/.test(t) ||
      /^[\$£][\d,.]+$/.test(t) ||
      EMPTY.test(t) ||
      /^[\d.]+%$/.test(t)
    ) {
      dataStart = i
      break
    }
  }

  if (dataStart < 0) return {}

  for (let i = dataStart; i < sorted.length; i++) {
    values.push(sorted[i].text.trim())
  }

  const row: Partial<PlacementRow> = {}
  let idx = 0

  const next = (): string => values[idx++] ?? ''

  while (idx < values.length) {
    const v = next()
    if (!v) continue

    if (!row.bidAdjustment && /^\d+%$/.test(v)) {
      row.bidAdjustment = v
      continue
    }

    if (!row.impressions && (EMPTY.test(v) || /^[\d,]+$/.test(v) || /^\d+$/.test(v))) {
      row.impressions = EMPTY.test(v) ? '' : fixOcrNumber(v)
      continue
    }

    if (!row.clicks && (EMPTY.test(v) || /^\d+$/.test(v))) {
      row.clicks = EMPTY.test(v) ? '' : v
      continue
    }

    if (!row.ctr && (EMPTY.test(v) || /^[\d.]+%$/.test(v))) {
      row.ctr = EMPTY.test(v) ? '' : fixOcrPercent(v)
      continue
    }

    if (!row.totalCost && (EMPTY.test(v) || /^[\$£][\d,.]+$/.test(v))) {
      row.totalCost = EMPTY.test(v) ? '' : fixOcrCurrency(v)
      continue
    }

    if (!row.cpc && (EMPTY.test(v) || /^[\$£][\d.]+$/.test(v))) {
      row.cpc = EMPTY.test(v) ? '' : fixOcrCurrency(v)
      continue
    }

    if (!row.purchases && (EMPTY.test(v) || /^\d+$/.test(v))) {
      row.purchases = EMPTY.test(v) ? '' : v
      continue
    }

    if (!row.sales && (EMPTY.test(v) || /^[\$£][\d,.]+$/.test(v))) {
      row.sales = EMPTY.test(v) ? '' : fixOcrCurrency(v)
      continue
    }

    if (!row.acos && (EMPTY.test(v) || /%$/.test(v) || /^\d+\.?\d*$/.test(v))) {
      row.acos = EMPTY.test(v) ? '' : fixOcrAcos(v)
      continue
    }
  }

  return row
}

/**
 * Alternative: extract by scanning for value patterns in strict column order.
 * More tolerant of OCR splitting/merging.
 */
function extractRowByPattern(words: TsvWord[]): Partial<PlacementRow> {
  const texts = words
    .sort((a, b) => a.left - b.left)
    .map((w) => w.text.trim())
    .filter((t) => t && !/^(placement|name|campaign|bid|strategy|dynamic|bidding|down|only|impressions|clicks|ctr|total|cost|cpc|purchases|sales|acos|first|page|search|of|product|pages|top|rest)$/i.test(t))

  const row: Partial<PlacementRow> = {}
  let i = 0

  const patterns: Array<{ key: keyof PlacementRow; test: (s: string) => boolean; fix?: (s: string) => string }> = [
    { key: 'bidAdjustment', test: (s) => /^\d+%$/.test(s) },
    { key: 'impressions', test: (s) => EMPTY.test(s) || /^[\d,]+$/.test(s) || /^\d+$/.test(s), fix: fixOcrNumber },
    { key: 'clicks', test: (s) => EMPTY.test(s) || /^\d+$/.test(s) },
    { key: 'ctr', test: (s) => EMPTY.test(s) || /^[\d.]+%$/.test(s), fix: fixOcrPercent },
    { key: 'totalCost', test: (s) => EMPTY.test(s) || /^[\$£][\d,.]+$/.test(s), fix: fixOcrCurrency },
    { key: 'cpc', test: (s) => EMPTY.test(s) || /^[\$£][\d.]+$/.test(s), fix: fixOcrCurrency },
    { key: 'purchases', test: (s) => EMPTY.test(s) || /^\d+$/.test(s) },
    { key: 'sales', test: (s) => EMPTY.test(s) || /^[\$£][\d,.]+$/.test(s), fix: fixOcrCurrency },
    { key: 'acos', test: (s) => EMPTY.test(s) || /%$/.test(s) || /^\d+\.?\d*$/.test(s), fix: fixOcrAcos },
  ]

  for (const { key, test, fix } of patterns) {
    if (row[key]) continue
    while (i < texts.length) {
      const v = texts[i++]
      if (!v) break
      if (test(v)) {
        row[key] = EMPTY.test(v) ? '' : fix ? fix(v) : v
        break
      }
    }
  }

  return row
}

export function parsePlacementOcrResult(
  text: string,
  blocks: unknown,
  tsv: string | null
): ExtractedPlacementData {
  const defaultResult: ExtractedPlacementData = {
    topOfSearch: emptyRow('Top of search (first page)'),
    restOfSearch: emptyRow('Rest of search'),
    productPages: emptyRow('Product pages'),
  }

  if (!tsv || tsv.length < 100) {
    return parsePlacementFromText(text) ?? defaultResult
  }

  const words = parseTsvWords(tsv)
  if (words.length < 10) return defaultResult

  let rows: TsvWord[][]

  const hasLineNum = words.some((w) => typeof w.lineNum === 'number' && !isNaN(w.lineNum))
  if (hasLineNum) {
    const byLine = new Map<string, TsvWord[]>()
    for (const w of words) {
      const lineKey = typeof w.lineNum === 'number' && !isNaN(w.lineNum) ? w.lineNum : Math.round(w.top / 15)
      const key = `${w.blockNum ?? 0}-${lineKey}`
      if (!byLine.has(key)) byLine.set(key, [])
      byLine.get(key)!.push(w)
    }
    rows = Array.from(byLine.entries())
      .sort((a, b) => {
        const aTop = Math.min(...a[1].map((w) => w.top))
        const bTop = Math.min(...b[1].map((w) => w.top))
        return aTop - bTop
      })
      .map(([, ws]) => ws)
  } else {
    const minTop = Math.min(...words.map((w) => w.top))
    const maxTop = Math.max(...words.map((w) => w.top))
    const rowHeight = (maxTop - minTop) / 10 || 15
    const topTol = Math.max(8, Math.min(20, rowHeight * 0.5))
    const byTop = new Map<number, TsvWord[]>()
    for (const w of words) {
      const key = Math.round(w.top / topTol) * topTol
      if (!byTop.has(key)) byTop.set(key, [])
      byTop.get(key)!.push(w)
    }
    rows = Array.from(byTop.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, ws]) => ws)
  }

  const dataRows: Array<{ type: 'top' | 'rest' | 'product'; words: TsvWord[] }> = []
  let dataRowIndex = 0
  for (const rowWords of rows) {
    if (isHeaderRow(rowWords)) continue
    if (!isDataRow(rowWords)) continue

    let type = identifyPlacementType(rowWords)
    if (!type) {
      type = dataRowIndex === 0 ? 'top' : dataRowIndex === 1 ? 'rest' : 'product'
    }
    dataRows.push({ type, words: rowWords })
    dataRowIndex++
    if (dataRowIndex >= 3) break
  }

  const result = { ...defaultResult }
  const labels = { top: 'Top of search (first page)', rest: 'Rest of search', product: 'Product pages' }

  for (const { type, words } of dataRows) {
    let extracted = extractRowByPosition(words)
    if (Object.keys(extracted).length < 3) {
      extracted = extractRowByPattern(words)
    }

    const row: PlacementRow = {
      placementName: labels[type],
      bidAdjustment: extracted.bidAdjustment ?? '',
      impressions: extracted.impressions ?? '',
      clicks: extracted.clicks ?? '',
      ctr: extracted.ctr ?? '',
      totalCost: extracted.totalCost ?? '',
      cpc: extracted.cpc ?? '',
      purchases: extracted.purchases ?? '',
      sales: extracted.sales ?? '',
      acos: extracted.acos ?? '',
    }

    if (type === 'top') result.topOfSearch = row
    else if (type === 'rest') result.restOfSearch = row
    else result.productPages = row
  }

  const textFallback = parsePlacementFromText(text)
  if (textFallback) {
    for (const key of ['topOfSearch', 'restOfSearch', 'productPages'] as const) {
      const tsvRow = result[key]
      const textRow = textFallback[key]
      for (const col of ['bidAdjustment', 'impressions', 'clicks', 'ctr', 'totalCost', 'cpc', 'purchases', 'sales', 'acos'] as const) {
        const tsvVal = tsvRow[col]
        const textVal = textRow[col]
        if ((!tsvVal || tsvVal === '') && textVal && textVal !== '') {
          ;(result[key] as PlacementRow)[col] = textVal
        }
      }
    }
  }

  return result
}

function parsePlacementFromText(text: string): ExtractedPlacementData | null {
  const result: ExtractedPlacementData = {
    topOfSearch: emptyRow('Top of search (first page)'),
    restOfSearch: emptyRow('Rest of search'),
    productPages: emptyRow('Product pages'),
  }

  const sections = text.split(/(?=Rest of search|Product pages)/i)
  for (const section of sections) {
    let row: PlacementRow
    if (/Top of search|first page/i.test(section) && !/Rest of search|Product pages/i.test(section))
      row = result.topOfSearch
    else if (/Rest of search/i.test(section) && !/Product pages/i.test(section))
      row = result.restOfSearch
    else if (/Product pages/i.test(section))
      row = result.productPages
    else continue

    const tokens = section.split(/\s+/).map((s) => s.trim()).filter(Boolean)
    for (const t of tokens) {
      if (!row.bidAdjustment && /^\d+%$/.test(t)) row.bidAdjustment = t
      else if (!row.impressions && (/^[\d,]+$/.test(t) || /^\d+$/.test(t)) && !EMPTY.test(t)) row.impressions = fixOcrNumber(t)
      else if (!row.clicks && (/^\d+$/.test(t) || EMPTY.test(t))) row.clicks = EMPTY.test(t) ? '' : t
      else if (!row.ctr && (/^[\d.]+%$/.test(t) || EMPTY.test(t))) row.ctr = EMPTY.test(t) ? '' : fixOcrPercent(t)
      else if (!row.totalCost && (/^[\$£][\d,.]+$/.test(t) || EMPTY.test(t))) row.totalCost = EMPTY.test(t) ? '' : fixOcrCurrency(t)
      else if (!row.cpc && (/^[\$£][\d.]+$/.test(t) || EMPTY.test(t))) row.cpc = EMPTY.test(t) ? '' : fixOcrCurrency(t)
      else if (!row.purchases && (/^\d+$/.test(t) || EMPTY.test(t))) row.purchases = EMPTY.test(t) ? '' : t
      else if (!row.sales && (/^[\$£][\d,.]+$/.test(t) || EMPTY.test(t))) row.sales = EMPTY.test(t) ? '' : fixOcrCurrency(t)
      else if (!row.acos && (/%$/.test(t) || /^\d+\.?\d*$/.test(t) || EMPTY.test(t))) row.acos = EMPTY.test(t) ? '' : fixOcrAcos(t)
    }
  }

  return result
}
