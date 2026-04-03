import { normalize } from '../../utils/normalize'
import { parseCSV } from '../../utils/csv'

/**
 * Extract the KEYWORD from a campaign title in format:
 * (INTENT) I KEYWORD I EXACT I SP I ASIN
 * e.g. (WATER) I water test strips I EXACT I SP I B0DV3ZG4
 *
 * Also accepts a lowercase "l" instead of "I" after the intent (common typo in exports):
 * (UTI) l uti test I EXACT ...
 */
export function extractKeywordFromExactTitle(title: string): string | null {
  if (!title || typeof title !== 'string') return null
  const s = title.trim()
  // Match ") I " or ") l " then capture until " I EXACT"
  const match = s.match(/\)\s*[Il]\s+(.+?)\s+I\s+EXACT\s+/i)
  if (match && match[1]) return match[1].trim()
  return null
}

/** Find column index whose header contains "campaign" (case-insensitive) */
export function findCampaignNameColumn(headers: string[]): number {
  const lower = headers.map((h) => (h ?? '').trim().toLowerCase().replace(/^"+|"+$/g, ''))
  const idx = lower.findIndex((h) => h.includes('campaign'))
  return idx >= 0 ? idx : 0
}

function findColumn(headers: string[], ...substrings: string[]): number {
  const lower = headers.map((h) => (h ?? '').trim().toLowerCase().replace(/^"+|"+$/g, ''))
  for (const sub of substrings) {
    const idx = lower.findIndex((h) => h.includes(sub))
    if (idx >= 0) return idx
  }
  return -1
}

function parseNum(val: string): number {
  const s = String(val ?? '').trim().replace(/[$,£€\s]/g, '')
  if (!s) return 0
  const n = parseFloat(s.replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

export interface ReferenceExactMetrics {
  orders: number
  sales: number
  spend: number
  acosPct: number
  clicks: number
  cvrPct: number | null
}

export interface ReferenceExactResult {
  keywords: Set<string>
  metricsByKeyword: Map<string, ReferenceExactMetrics>
  /** Rows in the CSV that matched the EXACT title pattern (one per campaign line) */
  campaignRowCount: number
}

/**
 * Parse Reference Exact CSV and return a Set of normalized keywords
 * that are already running as EXACT campaigns.
 */
export function parseReferenceExactCsv(csvText: string): Set<string> {
  return parseReferenceExactCsvWithMetrics(csvText).keywords
}

/**
 * Parse Reference Exact CSV and return a Set of keywords plus metrics per keyword.
 * Aggregates metrics when same keyword appears in multiple rows.
 */
export function parseReferenceExactCsvWithMetrics(csvText: string): ReferenceExactResult {
  const rows = parseCSV(csvText)
  const keywords = new Set<string>()
  const metricsByKeyword = new Map<string, ReferenceExactMetrics>()

  if (rows.length < 2) return { keywords, metricsByKeyword, campaignRowCount: 0 }

  let campaignRowCount = 0
  const headers = rows[0].map((h) => (h ?? '').trim())
  const campaignCol = findCampaignNameColumn(headers)
  const targetingCol = findColumn(headers, 'targeting', 'keyword')
  const spendCol = findColumn(headers, 'spend', 'cost', 'total')
  const salesCol = findColumn(headers, 'sales', 'attributed')
  const ordersCol = findColumn(headers, 'orders', 'purchases', 'unit')
  const clicksCol = findColumn(headers, 'clicks')

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const campaignCell = (row[campaignCol] ?? '').trim().replace(/^"+|"+$/g, '')
    let keyword = extractKeywordFromExactTitle(campaignCell)
    if (!keyword && targetingCol >= 0) {
      const targetingCell = (row[targetingCol] ?? '').trim().replace(/^"+|"+$/g, '')
      if (targetingCell && /exact/i.test(campaignCell)) keyword = targetingCell
    }
    if (!keyword) continue

    const norm = normalize(keyword)
    if (!norm) continue

    campaignRowCount++

    const spend = spendCol >= 0 ? parseNum(row[spendCol] ?? '') : 0
    const sales = salesCol >= 0 ? parseNum(row[salesCol] ?? '') : 0
    const orders = ordersCol >= 0 ? parseNum(row[ordersCol] ?? '') : 0
    const clicks = clicksCol >= 0 ? parseNum(row[clicksCol] ?? '') : 0

    // When sales is 0, acosPct is 0 as a placeholder only — performanceComparison uses exact.sales to avoid treating this as a real 0% ACOS.
    const acosPct = sales > 0 ? (spend / sales) * 100 : 0
    const cvrPct = clicks > 0 ? (orders / clicks) * 100 : null

    keywords.add(norm)

    const existing = metricsByKeyword.get(norm)
    if (existing) {
      existing.orders += orders
      existing.sales += sales
      existing.spend += spend
      existing.clicks += clicks
      existing.acosPct = existing.sales > 0 ? (existing.spend / existing.sales) * 100 : 0
      existing.cvrPct = existing.clicks > 0 ? (existing.orders / existing.clicks) * 100 : null
    } else {
      metricsByKeyword.set(norm, {
        orders,
        sales,
        spend,
        acosPct,
        clicks,
        cvrPct,
      })
    }
  }

  return { keywords, metricsByKeyword, campaignRowCount }
}
