/**
 * Parse placement-level PPC data from CSV.
 * Expects rows: Top of search (first page), Rest of search, Product pages.
 * Columns: Placement Name, Bid adj., Impressions, Clicks, CTR, Total cost, CPC, Purchases, Sales, ACOS.
 */

import type { ExtractedPlacementData, PlacementRow } from './placementParser'

const COLUMN_PATTERNS: Array<{
  key: keyof PlacementRow
  patterns: RegExp[]
  normalize: (raw: string) => string
}> = [
  {
    key: 'bidAdjustment',
    patterns: [/^bid\s*adj/i, /^bid\s*adjustment/i, /^adjustment/i],
    normalize: (s) => normalizePercent(s),
  },
  {
    key: 'impressions',
    patterns: [/^impressions?$/i, /^impr\.?$/i],
    normalize: (s) => normalizeInteger(s),
  },
  {
    key: 'clicks',
    patterns: [/^clicks?$/i],
    normalize: (s) => normalizeInteger(s),
  },
  {
    key: 'ctr',
    patterns: [/^ctr$/i],
    normalize: (s) => normalizePercent(s),
  },
  {
    key: 'totalCost',
    patterns: [/total\s*cost\s*\(/i, /^total\s*cost$/i, /^spend$/i, /^cost$/i],
    normalize: (s) => normalizeCurrency(s),
  },
  {
    key: 'cpc',
    patterns: [/^cpc\s*\(/i, /^cpc$/i, /^avg\.?\s*cpc$/i],
    normalize: (s) => normalizeCurrency(s),
  },
  {
    key: 'purchases',
    patterns: [/^purchases?$/i, /^units\s*sold$/i],
    normalize: (s) => normalizeInteger(s),
  },
  {
    key: 'sales',
    patterns: [/^sales\s*\(/i, /^sales?$/i, /^total\s*sales$/i],
    normalize: (s) => normalizeCurrency(s),
  },
  {
    key: 'acos',
    patterns: [/^acos$/i, /^ac?s$/i],
    normalize: (s) => normalizeAcos(s),
  },
]

function normalizeCurrency(raw: string): string {
  const s = String(raw ?? '').trim().replace(/[,$£\s]/g, '')
  if (!s) return ''
  const n = parseFloat(s)
  return isNaN(n) ? '' : `$${n.toFixed(2)}`
}

function normalizeInteger(raw: string): string {
  const s = String(raw ?? '').trim().replace(/[,.\s]/g, '')
  if (!s) return ''
  const n = parseInt(s, 10)
  return isNaN(n) ? '' : n.toLocaleString()
}

function normalizePercent(raw: string): string {
  const s = String(raw ?? '').trim().replace(/%/g, '')
  if (!s) return ''
  const n = parseFloat(s)
  return isNaN(n) ? '' : String(n)
}

/** ACOS: 0.4216 (decimal) → 42.16, 42.16 (percent) → 42.16 */
function normalizeAcos(raw: string): string {
  const s = String(raw ?? '').trim().replace(/%/g, '')
  if (!s) return ''
  let n = parseFloat(s)
  if (isNaN(n)) return ''
  if (n > 0 && n < 1) n = n * 100
  return String(n)
}

function findColumnIndex(headers: string[], patterns: RegExp[]): number {
  for (let i = 0; i < headers.length; i++) {
    const h = (headers[i] ?? '').trim()
    for (const p of patterns) {
      if (p.test(h)) return i
    }
  }
  return -1
}

function parseCsvRows(text: string): string[][] {
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
      current.push(cell.trim())
      cell = ''
      continue
    }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      current.push(cell.trim())
      rows.push(current)
      current = []
      cell = ''
      continue
    }
    cell += c
  }
  current.push(cell.trim())
  if (current.some((c) => c)) rows.push(current)
  return rows
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

function identifyPlacementFromCell(cell: string): 'top' | 'rest' | 'product' | null {
  const s = (cell ?? '').toLowerCase()
  if (s.includes('placement_top') || (s.includes('top') && s.includes('search'))) return 'top'
  if (s.includes('placement_rest') || (s.includes('rest') && s.includes('search'))) return 'rest'
  if (s.includes('placement_product') || (s.includes('product') && (s.includes('page') || s.includes('pages')))) return 'product'
  if (s === 'top') return 'top'
  if (s.includes('rest')) return 'rest'
  if (s.includes('product')) return 'product'
  return null
}

export function parsePlacementCsv(text: string): ExtractedPlacementData {
  const defaultResult: ExtractedPlacementData = {
    topOfSearch: emptyRow('Top of search (first page)'),
    restOfSearch: emptyRow('Rest of search'),
    productPages: emptyRow('Product pages'),
  }

  const rows = parseCsvRows(text.replace(/\ufeff/g, ''))
  if (rows.length < 2) return defaultResult

  const headers = rows[0].map((h) => (h ?? '').trim())
  const placementCol = findColumnIndex(headers, [
    /^placement/i,
    /^placement\s*name/i,
    /^row$/i,
  ])
  const colIndices: Partial<Record<keyof PlacementRow, number>> = {}
  for (const { key, patterns } of COLUMN_PATTERNS) {
    const idx = findColumnIndex(headers, patterns)
    if (idx >= 0) colIndices[key] = idx
  }

  const result = { ...defaultResult }
  const labels: Record<'top' | 'rest' | 'product', string> = {
    top: 'Top of search (first page)',
    rest: 'Rest of search',
    product: 'Product pages',
  }

  const dataRows = rows.slice(1).filter((row) => row.some((c) => (c ?? '').trim() && !/^\s*[-—–]\s*$/.test((c ?? '').trim())))
  const order: Array<'top' | 'rest' | 'product'> = ['top', 'rest', 'product']

  for (let i = 0; i < Math.min(3, dataRows.length); i++) {
    const row = dataRows[i]
    let placementType: 'top' | 'rest' | 'product' = order[i]

    if (placementCol >= 0) {
      const cell = (row[placementCol] ?? '').trim()
      const identified = identifyPlacementFromCell(cell)
      if (identified) placementType = identified
    }

    const extracted: Partial<PlacementRow> = {}
    for (const [key, idx] of Object.entries(colIndices)) {
      const k = key as keyof PlacementRow
      const val = (row[idx as number] ?? '').trim()
      if (val && !/^\s*[-—–]\s*$/.test(val)) {
        const def = COLUMN_PATTERNS.find((c) => c.key === k)
        extracted[k] = def ? def.normalize(val) : val
      }
    }

    const fullRow: PlacementRow = {
      placementName: labels[placementType],
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

    if (placementType === 'top') result.topOfSearch = fullRow
    else if (placementType === 'rest') result.restOfSearch = fullRow
    else result.productPages = fullRow
  }

  return result
}
