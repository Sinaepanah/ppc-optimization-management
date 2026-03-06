/**
 * Parse ad-level PPC data from CSV.
 * Extracts: Bid, Impressions, Clicks, Total Cost, CPC, Purchases, Sales, ACOS.
 * Uses flexible column matching for various Amazon export formats.
 */

export interface ExtractedAdLevelData {
  bid?: string
  impressions?: string
  clicks?: string
  totalCost?: string
  cpc?: string
  purchases?: string
  sales?: string
  acos?: string
}

const AD_LEVEL_FIELDS: Array<{
  key: keyof ExtractedAdLevelData
  patterns: RegExp[]
  normalize: (raw: string) => string
}> = [
  {
    key: 'bid',
    patterns: [/^bid\s*\(/i, /^bid$/i, /^max\s*bid$/i, /^default\s*bid$/i, /^campaign\s*bid$/i],
    normalize: (s) => normalizeCurrency(s),
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
    key: 'totalCost',
    patterns: [/total\s*cost\s*\(/i, /^total\s*cost$/i, /^spend$/i, /^cost$/i, /^total\s*spend$/i],
    normalize: (s) => normalizeCurrency(s),
  },
  {
    key: 'cpc',
    patterns: [/^cpc\s*\(/i, /^cpc$/i, /^avg\.?\s*cpc$/i, /^average\s*cpc$/i],
    normalize: (s) => normalizeCurrency(s),
  },
  {
    key: 'purchases',
    patterns: [/^purchases?$/i, /^units\s*sold$/i, /^orders$/i],
    normalize: (s) => normalizeInteger(s),
  },
  {
    key: 'sales',
    patterns: [/^sales\s*\(/i, /^sales?$/i, /^total\s*sales$/i, /^revenue$/i],
    normalize: (s) => normalizeCurrency(s),
  },
  {
    key: 'acos',
    patterns: [/^acos$/i, /^ac?s$/i, /^acoss?$/i],
    normalize: (s) => normalizePercent(s),
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

/** ACOS: 0.4216 (decimal) → 42.16, 42.16 (percent) → 42.16. Stored without % for display. */
function normalizePercent(raw: string): string {
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

export function parseAdLevelCsv(text: string): ExtractedAdLevelData {
  const rows = parseCsvRows(text.replace(/\ufeff/g, ''))
  if (rows.length < 2) return {}

  const headers = rows[0].map((h) => (h ?? '').trim())
  const result: ExtractedAdLevelData = {}

  const dataRowIndex = rows.findIndex((row, i) => {
    if (i === 0) return false
    const filled = row.filter((c) => (c ?? '').trim() && !/^\s*[-—–]\s*$/.test((c ?? '').trim())).length
    return filled >= 3
  })
  const dataRow = dataRowIndex >= 0 ? rows[dataRowIndex] : rows[1]

  for (const { key, patterns, normalize } of AD_LEVEL_FIELDS) {
    const idx = findColumnIndex(headers, patterns)
    if (idx >= 0 && dataRow) {
      const val = (dataRow[idx] ?? '').trim()
      if (val && !/^\s*[-—–]\s*$/.test(val)) {
        const normalized = normalize(val)
        if (normalized) result[key] = normalized
      }
    }
  }

  return result
}
