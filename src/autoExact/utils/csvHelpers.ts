import { parseCSV } from '../../utils/csv'
import type { ColumnMapping, ParsedRow, RawRow } from '../types'

const SEARCH_TERM_NAMES = [
  'Customer Search Term',
  'Customer search term',
  'Search term',
  'Search Term',
  'Query',
  'Keyword',
]
const SPEND_NAMES = [
  'Spend',
  'Spend(USD)',
  'Cost',
  'Total Cost',
  '14 Day Total Spend',
  '7 Day Total Spend',
  'Spend (USD)',
  'Cost (USD)',
]
const SALES_NAMES = [
  'Sales',
  'Sales(USD)',
  'Attributed Sales',
  '14 Day Total Sales',
  '7 Day Total Sales',
  'Total Sales',
  'Attributed Sales (USD)',
  'Sales (USD)',
]
const ORDERS_NAMES = [
  'Orders',
  'Total Orders',
  '14 Day Total Orders',
  '7 Day Total Orders',
  'Unit Sold',
  'Purchases',
]
const CLICKS_NAMES = ['Clicks', 'Total Clicks']
const IMPRESSIONS_NAMES = ['Impressions']
const CPC_NAMES = ['CPC(USD)', 'CPC (USD)', 'CPC', 'Avg CPC']
const CAMPAIGN_NAMES = ['Campaign Name', 'Campaign']
const AD_GROUP_NAMES = ['Ad Group Name', 'Ad Group']
const MATCH_TYPE_NAMES = ['Match Type']
const TARGETING_NAMES = ['Targeting', 'Keyword', 'Target']

/** Normalize header for matching: trim, strip BOM and surrounding quotes, lowercase */
function normHeader(h: string): string {
  return (h ?? '')
    .trim()
    .replace(/^\uFEFF/, '')
    .replace(/^"+|"+$/g, '')
    .trim()
    .toLowerCase()
}

function findColumn(headers: string[], options: string[]): number {
  const normalized = headers.map(normHeader)
  for (const name of options) {
    const want = name.trim().toLowerCase()
    const idx = normalized.findIndex((h) => h === want)
    if (idx !== -1) return idx
  }
  return -1
}

/** Fallback: first column whose header contains the given substring */
function findColumnContains(headers: string[], substring: string): number {
  const sub = substring.toLowerCase()
  const normalized = headers.map(normHeader)
  return normalized.findIndex((h) => h.includes(sub))
}

function findColumnOr(headers: string[], exactList: string[], ...contains: string[]): number {
  let idx = findColumn(headers, exactList)
  if (idx >= 0) return idx
  for (const sub of contains) {
    idx = findColumnContains(headers, sub)
    if (idx >= 0) return idx
  }
  return -1
}

export function getHeaderSuggestions(rows: string[][]): ColumnMapping {
  if (rows.length === 0) {
    return { searchTerm: 0, spend: -1, sales: -1, orders: -1, clicks: -1, impressions: -1, cpc: -1, campaignName: -1, adGroupName: -1, matchType: -1, targeting: -1 }
  }
  const rawHeaders = rows[0].map((h) => (h ?? '').trim().replace(/^\uFEFF/, '').replace(/^"+|"+$/g, ''))
  const headers = rawHeaders.length ? rawHeaders : []
  const searchTermIdx = findColumn(headers, SEARCH_TERM_NAMES)
  return {
    searchTerm: searchTermIdx >= 0 ? searchTermIdx : 0,
    spend: findColumnOr(headers, SPEND_NAMES, 'spend', 'cost'),
    sales: findColumnOr(headers, SALES_NAMES, 'sales'),
    orders: findColumnOr(headers, ORDERS_NAMES, 'orders', 'unit sold', 'purchases'),
    clicks: findColumnOr(headers, CLICKS_NAMES, 'clicks'),
    impressions: findColumn(headers, IMPRESSIONS_NAMES),
    cpc: findColumnOr(headers, CPC_NAMES, 'cpc'),
    campaignName: findColumn(headers, CAMPAIGN_NAMES),
    adGroupName: findColumn(headers, AD_GROUP_NAMES),
    matchType: findColumn(headers, MATCH_TYPE_NAMES),
    targeting: findColumn(headers, TARGETING_NAMES),
  }
}

export function getColumnOptions(rows: string[][]): string[] {
  if (rows.length === 0) return []
  return rows[0].map((h, i) => (h?.trim() || `Column ${i + 1}`))
}

export function parseCSVText(text: string): string[][] {
  return parseCSV(text)
}

/** Parse pasted tab-delimited text into rows */
export function parsePastedTabDelimited(text: string): string[][] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  return lines.map((line) => line.split(/\t/).map((c) => c.trim()))
}

/** Parse number from CSV: strips quotes/currency, handles US (1,234.56) and EU (1.234,56 or 12,34) style */
function num(val: string): number {
  let s = String(val ?? '').trim().replace(/^"+|"+$/g, '')
  if (!s) return 0
  s = s.replace(/^\uFEFF/, '') // BOM
  s = s.replace(/[$€£¥\s]/g, '')
  const hasComma = s.includes(',')
  const hasPeriod = s.includes('.')
  if (hasComma && !hasPeriod) {
    s = s.replace(/,/g, '.')
  } else if (hasComma && hasPeriod) {
    const lastComma = s.lastIndexOf(',')
    const lastPeriod = s.lastIndexOf('.')
    if (lastComma > lastPeriod) {
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      s = s.replace(/,/g, '')
    }
  } else if (hasComma) {
    s = s.replace(/,/g, '')
  }
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

function str(val: string): string {
  return String(val ?? '').trim()
}

/** Build raw row from string array (by column index) */
export function rowToRaw(row: string[]): RawRow {
  const out: RawRow = {}
  row.forEach((v, i) => {
    out[i] = v
  })
  return out
}

/** Parse one raw row using column mapping. Returns null if required fields missing. */
export function parseRow(raw: RawRow, mapping: ColumnMapping): ParsedRow | null {
  const term = str(raw[mapping.searchTerm] ?? '')
  if (!term) return null
  return {
    searchTerm: term,
    spend: num(raw[mapping.spend] ?? ''),
    sales: num(raw[mapping.sales] ?? ''),
    orders: num(raw[mapping.orders] ?? ''),
    clicks: mapping.clicks >= 0 ? num(raw[mapping.clicks] ?? '') : null,
    impressions: mapping.impressions >= 0 ? num(raw[mapping.impressions] ?? '') : null,
    cpc: mapping.cpc >= 0 ? num(raw[mapping.cpc] ?? '') : null,
    campaignName: mapping.campaignName >= 0 ? str(raw[mapping.campaignName] ?? '') || null : null,
    adGroupName: mapping.adGroupName >= 0 ? str(raw[mapping.adGroupName] ?? '') || null : null,
    matchType: mapping.matchType >= 0 ? str(raw[mapping.matchType] ?? '') || null : null,
    targeting: mapping.targeting >= 0 ? str(raw[mapping.targeting] ?? '') || null : null,
  }
}

export function getRequiredMissing(mapping: ColumnMapping): string[] {
  const missing: string[] = []
  if (mapping.searchTerm < 0) missing.push('Search Term')
  if (mapping.spend < 0) missing.push('Spend')
  if (mapping.sales < 0) missing.push('Sales')
  if (mapping.orders < 0) missing.push('Orders')
  return missing
}
