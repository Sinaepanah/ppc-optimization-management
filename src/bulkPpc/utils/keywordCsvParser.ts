/**
 * Parse Amazon keyword report CSV (Broad/Phrase campaigns).
 * Each row = one keyword. Flexible column matching for various Amazon export formats.
 */

import { parseCSV } from '../../utils/csv'

export interface KeywordRow {
  campaign?: string
  adGroup?: string
  keyword?: string
  matchType?: string
  bid?: string
  impressions?: string
  clicks?: string
  spend?: string
  orders?: string
  sales?: string
  acos?: string
  cpc?: string
  ctr?: string
  cvr?: string
  /** All original columns for display */
  raw: Record<string, string>
}

const COLUMN_MAPPINGS: Array<{
  key: keyof Omit<KeywordRow, 'raw'>
  patterns: RegExp[]
  normalize?: (s: string) => string
}> = [
  { key: 'campaign', patterns: [/^campaign\s*name$/i, /^campaign$/i] },
  { key: 'adGroup', patterns: [/^ad\s*group\s*name$/i, /^ad\s*group$/i] },
  { key: 'keyword', patterns: [/^keyword$/i, /^targeting$/i] },
  { key: 'matchType', patterns: [/^target\s*match\s*type$/i, /^match\s*type$/i, /^match$/i] },
  {
    key: 'bid',
    patterns: [/keyword\s*bid/i, /^bid\s*\(usd\)$/i, /^bid$/i, /^max\s*bid$/i, /^default\s*bid$/i],
    normalize: (s) => normalizeCurrency(s),
  },
  { key: 'impressions', patterns: [/^impressions?$/i, /^impr\.?$/i], normalize: normalizeNum },
  { key: 'clicks', patterns: [/^clicks?$/i], normalize: normalizeNum },
  {
    key: 'spend',
    patterns: [/^total\s*cost\s*\(usd\)$/i, /^spend$/i, /^cost$/i, /^total\s*cost$/i, /^total\s*spend$/i],
    normalize: (s) => normalizeCurrency(s),
  },
  { key: 'orders', patterns: [/^orders$/i, /^purchases?$/i, /^units\s*sold$/i], normalize: normalizeNum },
  {
    key: 'sales',
    patterns: [/^sales\s*\(usd\)$/i, /^sales$/i, /^total\s*sales$/i, /^14\s*day\s*total\s*sales$/i, /^revenue$/i],
    normalize: (s) => normalizeCurrency(s),
  },
  {
    key: 'acos',
    patterns: [/advertising\s*cost\s*of\s*sales/i, /^acos$/i, /^ac?s$/i, /^acoss?$/i],
    normalize: normalizePercent,
  },
  {
    key: 'cpc',
    patterns: [/cost-per-click/i, /cost\s*per\s*click/i, /^cpc\s*\(usd\)$/i, /^cpc$/i, /^avg\.?\s*cpc$/i],
    normalize: (s) => normalizeCurrency(s),
  },
  { key: 'ctr', patterns: [/^ctr$/i, /^click-through\s*rate$/i], normalize: normalizePercent },
  { key: 'cvr', patterns: [/^cvr$/i, /^conversion\s*rate$/i], normalize: normalizePercent },
]

function normalizeCurrency(raw: string): string {
  const s = String(raw ?? '').trim().replace(/[,$£\s]/g, '')
  if (!s) return ''
  const n = parseFloat(s)
  return isNaN(n) ? '' : String(n.toFixed(2))
}

function normalizeNum(raw: string): string {
  const s = String(raw ?? '').trim().replace(/[,%\s]/g, '')
  if (!s) return ''
  const n = parseFloat(s)
  return isNaN(n) ? '' : String(n)
}

/** ACOS/percent: Amazon exports ACOS as decimal ratio (0.7254 = 72.54%, 1.3234 = 132.34%). */
function normalizePercent(raw: string): string {
  const s = String(raw ?? '').trim().replace(/%/g, '')
  if (!s) return ''
  let n = parseFloat(s)
  if (isNaN(n)) return ''
  if (n > 0 && n < 10) n = n * 100
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

function isEmptyRow(row: string[]): boolean {
  return !row.some((c) => (c ?? '').trim() && !/^\s*[-—–]\s*$/.test((c ?? '').trim()))
}

export interface KeywordCsvParseResult {
  headers: string[]
  rows: KeywordRow[]
  parseError?: string
}

export function parseKeywordCsv(text: string): KeywordCsvParseResult {
  const raw = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const allRows = parseCSV(raw)
  if (allRows.length < 2) {
    return { headers: [], rows: [], parseError: 'CSV must have a header row and at least one data row.' }
  }

  const headers = allRows[0].map((h) => (h ?? '').trim() || `Column ${allRows[0].indexOf(h) + 1}`)
  const rows: KeywordRow[] = []

  for (let i = 1; i < allRows.length; i++) {
    const row = allRows[i]
    if (isEmptyRow(row)) continue

    const rawRecord: Record<string, string> = {}
    const keywordRow: KeywordRow = { raw: rawRecord }

    for (let c = 0; c < headers.length; c++) {
      const val = (row[c] ?? '').trim()
      rawRecord[headers[c]] = val
    }

    for (const { key, patterns, normalize } of COLUMN_MAPPINGS) {
      const idx = findColumnIndex(headers, patterns)
      if (idx >= 0) {
        const val = (row[idx] ?? '').trim()
        if (val && !/^\s*[-—–]\s*$/.test(val)) {
          const out = normalize ? normalize(val) : val
          if (out) (keywordRow as Record<string, string>)[key] = out
        }
      }
    }

    rows.push(keywordRow)
  }

  return { headers, rows }
}
