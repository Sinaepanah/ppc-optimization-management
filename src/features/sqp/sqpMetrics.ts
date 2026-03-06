/**
 * SQP Metrics - normalization and computed fields
 * Purchases = purchasesASIN only. Purchase Rate = from CSV "Purchases: Purchase Rate %".
 */

import type { ColumnMapping } from './sqpColumnMapping'

export interface SQPRow {
  query: string
  searchVolume: number
  impressions: number
  clicks: number
  cartAdds: number
  purchases: number
  impressionShare: number
  clickShare: number
  cartAddShare: number
  purchaseShare: number
  purchaseRate: number
  cartAddRate: number
  ctr: number
  marketImpressions: number
  marketClicks: number
  marketCartAdds: number
  marketPurchases: number
}

/** Normalize numeric strings: "1,179" → 1179, "12.5%" → 12.5, "1.2K" → 1200 */
function toNum(val: unknown): number {
  if (typeof val === 'number' && !isNaN(val)) return val
  if (val === null || val === undefined) return 0
  let s = String(val).trim()
  if (!s) return 0
  s = s.replace(/,/g, '').replace(/%/g, '').replace(/\$/g, '').trim()
  const kMatch = s.match(/^([\d.]+)\s*[Kk]$/)
  if (kMatch) return parseFloat(kMatch[1]) * 1000
  const mMatch = s.match(/^([\d.]+)\s*[Mm]$/)
  if (mMatch) return parseFloat(mMatch[1]) * 1_000_000
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

/** Percent from CSV: "12.5%" or "12.5" → 0.125 for storage. Values > 1 treated as percent. */
function toPercent(val: unknown): number {
  const n = toNum(val)
  if (n > 1) return n / 100
  return n
}

export function normalizeRow(
  raw: Record<string, string | number>,
  mapping: ColumnMapping
): SQPRow | null {
  const get = (key: string | null) => (key ? toNum(raw[key]) : 0)
  const getPct = (key: string | null) => (key ? toPercent(raw[key]) : 0)

  const purchasesASIN = get(mapping.purchasesASIN)
  const clicksASIN = get(mapping.clicksASIN)
  const purchaseRateFromCsv = mapping.purchaseRate ? toPercent(raw[mapping.purchaseRate]) : 0

  if (purchaseRateFromCsv > 1) return null
  if (purchasesASIN > clicksASIN) return null
  if (clicksASIN === 0 && purchasesASIN > 0) return null

  return {
    query: raw[mapping.query ?? ''] != null ? String(raw[mapping.query ?? '']).trim() : '',
    searchVolume: get(mapping.searchVolume),
    impressions: get(mapping.impressionsASIN),
    clicks: clicksASIN,
    cartAdds: get(mapping.cartAddsASIN),
    purchases: purchasesASIN,
    impressionShare: getPct(mapping.impressionsShare),
    clickShare: getPct(mapping.clickShare),
    cartAddShare: getPct(mapping.cartAddShare),
    purchaseShare: getPct(mapping.purchaseShare),
    purchaseRate: mapping.purchaseRate ? getPct(mapping.purchaseRate) : clicksASIN > 0 ? purchasesASIN / clicksASIN : 0,
    cartAddRate: mapping.cartAddRate ? getPct(mapping.cartAddRate) : clicksASIN > 0 ? get(mapping.cartAddsASIN) / clicksASIN : 0,
    ctr: mapping.ctr ? getPct(mapping.ctr) : (() => {
      const imp = get(mapping.impressionsASIN)
      return imp > 0 ? clicksASIN / imp : 0
    })(),
    marketImpressions: get(mapping.impressionsTotal),
    marketClicks: get(mapping.clicksTotal),
    marketCartAdds: get(mapping.cartAddsTotal),
    marketPurchases: get(mapping.purchasesTotal),
  }
}

export interface SQPRowWithMetrics extends SQPRow {
  opportunityScore: number
  leakScore: number
  profitScore: number
}

export function computeMetrics(row: SQPRow): SQPRowWithMetrics {
  const opportunityScore =
    row.marketPurchases * Math.max(0, 1 - row.impressionShare)
  const leakScore = Math.max(0, row.clickShare - row.purchaseShare)
  const profitScore =
    row.searchVolume *
    row.purchaseRate *
    row.purchaseShare *
    Math.max(0, 1 - row.impressionShare)

  return {
    ...row,
    opportunityScore,
    leakScore,
    profitScore,
  }
}
