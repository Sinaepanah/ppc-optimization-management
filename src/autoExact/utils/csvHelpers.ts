import {
  detectAttributedSalesColumn,
  detectClicksColumn,
  detectPurchasesColumn,
  detectSpendColumn,
  findSearchTermReportHeaderRow,
  parseCSV,
} from '../../utils/csv'
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
  'Total cost',
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
  '14 Day Total Sales - (Click)',
  '7 Day Total Sales',
  'Total Sales',
  'Attributed Sales (USD)',
  'Sales (USD)',
]
const ORDERS_NAMES = [
  'Orders',
  'Total Orders',
  '14 Day Total Orders',
  '14 Day Total Orders (#)',
  '14 Day Total Orders (#) - (Click)',
  '7 Day Total Orders',
  '7 Day Total Orders (#)',
  'Unit Sold',
  'Purchases',
]
const CLICKS_NAMES = ['Clicks', 'Total Clicks']
const IMPRESSIONS_NAMES = ['Impressions']
const CPC_NAMES = ['CPC(USD)', 'CPC (USD)', 'CPC', 'Avg CPC', 'Cost Per Click (CPC)']
const CAMPAIGN_NAMES = ['Campaign Name', 'Campaign name', 'Campaign']
const AD_GROUP_NAMES = ['Ad Group Name', 'Ad Group']
const MATCH_TYPE_NAMES = ['Match Type', 'Target match type']
const TARGETING_NAMES = ['Targeting', 'Keyword', 'Keywords', 'Target']
const ROAS_NAMES = [
  'ROAS',
  'RoAS',
  'Return on Advertising Spend',
  'Total Return on Advertising Spend (ROAS)',
  '14 Day Total ROAS',
  '7 Day Total ROAS',
  'Total ROAS',
]
const ACOS_NAMES = [
  'ACOS',
  'ACoS',
  'Total Advertising Cost of Sales (ACOS)',
  'Advertising cost of sales (ACOS)',
]

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

function detectAcosColumn(headers: string[]): number {
  const idx = findColumn(headers, ACOS_NAMES)
  if (idx >= 0) return idx
  const normalized = headers.map(normHeader)
  for (let i = 0; i < normalized.length; i++) {
    const h = normalized[i]
    if (/\bacos\b/.test(h) && !/click\)/.test(h)) return i
  }
  return -1
}

function pickColumn(detected: number, headers: string[], exactList: string[], ...contains: string[]): number {
  if (detected >= 0) return detected
  return findColumnOr(headers, exactList, ...contains)
}

function hasDerivableSpend(mapping: ColumnMapping): boolean {
  return mapping.spend >= 0 || (mapping.clicks >= 0 && mapping.cpc >= 0)
}

function hasDerivableSales(mapping: ColumnMapping): boolean {
  return mapping.sales >= 0 || mapping.roas >= 0 || mapping.acos >= 0
}

/** Amazon exports ACoS as spend/sales ratio (0.63) or occasionally as percent (63). */
function acosRatioFromCell(val: string): number {
  const n = num(val)
  if (n <= 0) return 0
  return n > 10 ? n / 100 : n
}

export function getHeaderSuggestions(rows: string[][]): ColumnMapping {
  if (rows.length === 0) {
    return {
      searchTerm: 0,
      spend: -1,
      sales: -1,
      orders: -1,
      clicks: -1,
      impressions: -1,
      cpc: -1,
      campaignName: -1,
      adGroupName: -1,
      matchType: -1,
      targeting: -1,
      roas: -1,
      acos: -1,
    }
  }
  const headerRowIdx = findSearchTermReportHeaderRow(rows)
  const rawHeaders = (rows[headerRowIdx] ?? rows[0] ?? []).map((h) =>
    (h ?? '').trim().replace(/^\uFEFF/, '').replace(/^"+|"+$/g, '')
  )
  const headers = rawHeaders.length ? rawHeaders : []
  const searchTermIdx = findColumn(headers, SEARCH_TERM_NAMES)
  return {
    searchTerm: searchTermIdx >= 0 ? searchTermIdx : 0,
    spend: pickColumn(detectSpendColumn(headers), headers, SPEND_NAMES, 'spend', 'cost'),
    sales: pickColumn(detectAttributedSalesColumn(headers), headers, SALES_NAMES, 'sales'),
    orders: pickColumn(detectPurchasesColumn(headers), headers, ORDERS_NAMES, 'orders', 'unit sold', 'purchases'),
    clicks: pickColumn(detectClicksColumn(headers), headers, CLICKS_NAMES, 'clicks'),
    impressions: findColumn(headers, IMPRESSIONS_NAMES),
    cpc: findColumnOr(headers, CPC_NAMES, 'cpc'),
    campaignName: findColumn(headers, CAMPAIGN_NAMES),
    adGroupName: findColumn(headers, AD_GROUP_NAMES),
    matchType: findColumn(headers, MATCH_TYPE_NAMES),
    targeting: findColumn(headers, TARGETING_NAMES),
    roas: findColumnOr(headers, ROAS_NAMES, 'roas', 'return on advertising'),
    acos: detectAcosColumn(headers),
  }
}

export function getColumnOptions(rows: string[][]): string[] {
  if (rows.length === 0) return []
  const headerRowIdx = findSearchTermReportHeaderRow(rows)
  const header = rows[headerRowIdx] ?? rows[0]
  return header.map((h, i) => (h?.trim() || `Column ${i + 1}`))
}

export function parseCSVText(text: string): string[][] {
  return parseCSV(text)
}

/** Compare two header rows (trim, strip BOM/quotes) for duplicate detection across Amazon batch exports */
function rowsEqualAsHeaders(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const ca = normHeader(a[i] ?? '')
    const cb = normHeader(b[i] ?? '')
    if (ca !== cb) return false
  }
  return true
}

/**
 * Combine multiple parsed Amazon Search Term CSVs into one row matrix.
 * Each file typically includes the same header row; duplicate headers after the first file are skipped.
 */
export function mergeSourceCsvRows(parsedFiles: string[][][]): string[][] {
  const nonEmpty = parsedFiles.filter((p) => p.length > 0)
  if (nonEmpty.length === 0) return []
  const out: string[][] = [...nonEmpty[0]]
  const header = out[0]
  for (let i = 1; i < nonEmpty.length; i++) {
    const r = nonEmpty[i]
    const skipFirst = rowsEqualAsHeaders(r[0], header)
    out.push(...(skipFirst ? r.slice(1) : r))
  }
  return out
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

function deriveSpend(raw: RawRow, mapping: ColumnMapping): number {
  let spend = mapping.spend >= 0 ? num(raw[mapping.spend] ?? '') : 0
  if (spend <= 0 && mapping.clicks >= 0 && mapping.cpc >= 0) {
    const clicks = num(raw[mapping.clicks] ?? '')
    const cpc = num(raw[mapping.cpc] ?? '')
    if (clicks > 0 && cpc > 0) spend = clicks * cpc
  }
  return spend
}

function deriveSales(raw: RawRow, mapping: ColumnMapping, spend: number): number {
  let sales = mapping.sales >= 0 ? num(raw[mapping.sales] ?? '') : 0
  if (sales <= 0 && spend > 0) {
    if (mapping.roas >= 0) {
      const roas = num(raw[mapping.roas] ?? '')
      if (roas > 0) sales = spend * roas
    }
    if (sales <= 0 && mapping.acos >= 0) {
      const acos = acosRatioFromCell(raw[mapping.acos] ?? '')
      if (acos > 0) sales = spend / acos
    }
  }
  return sales
}

/** Parse one raw row using column mapping. Returns null if required fields missing. */
export function parseRow(raw: RawRow, mapping: ColumnMapping): ParsedRow | null {
  const term = str(raw[mapping.searchTerm] ?? '')
  if (!term) return null
  const spend = deriveSpend(raw, mapping)
  const sales = deriveSales(raw, mapping, spend)
  let roas: number | null = null
  if (spend > 0) {
    const computed = sales / spend
    if (mapping.roas >= 0) {
      const r = num(raw[mapping.roas] ?? '')
      roas = r > 0 && Number.isFinite(r) ? r : computed
    } else {
      roas = computed
    }
  }
  return {
    searchTerm: term,
    spend,
    sales,
    orders: num(raw[mapping.orders] ?? ''),
    clicks: mapping.clicks >= 0 ? num(raw[mapping.clicks] ?? '') : null,
    impressions: mapping.impressions >= 0 ? num(raw[mapping.impressions] ?? '') : null,
    cpc: mapping.cpc >= 0 ? num(raw[mapping.cpc] ?? '') : null,
    campaignName: mapping.campaignName >= 0 ? str(raw[mapping.campaignName] ?? '') || null : null,
    adGroupName: mapping.adGroupName >= 0 ? str(raw[mapping.adGroupName] ?? '') || null : null,
    matchType: mapping.matchType >= 0 ? str(raw[mapping.matchType] ?? '') || null : null,
    targeting: mapping.targeting >= 0 ? str(raw[mapping.targeting] ?? '') || null : null,
    roas,
  }
}

export function getRequiredMissing(mapping: ColumnMapping): string[] {
  const missing: string[] = []
  if (mapping.searchTerm < 0) missing.push('Search Term')
  if (!hasDerivableSpend(mapping)) missing.push('Spend')
  if (!hasDerivableSales(mapping)) missing.push('Sales')
  if (mapping.orders < 0) missing.push('Orders')
  return missing
}
