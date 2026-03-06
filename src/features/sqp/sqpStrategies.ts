/**
 * SQP Strategies - filter, rank, and recommend PPC actions
 */

import type { SQPRowWithMetrics } from './sqpMetrics'

export type StrategyId =
  | 'overview'
  | 'defendWinners'
  | 'scaleConverters'
  | 'visibilityGaps'
  | 'clickLeak'
  | 'cartAddFriction'
  | 'keywordScoring'

export interface StrategyConfig {
  id: StrategyId
  label: string
  description: string
  minClicks: number
  minPurchases: number
  minSearchVolume: number
  minImpressions: number
  minCartAdds: number
  minPurchaseShare?: number
  minPurchaseRate?: number
  minCartAddRate?: number
}

export const DEFAULT_THRESHOLDS: StrategyConfig = {
  id: 'overview',
  label: 'Overview',
  description: '',
  minClicks: 30,
  minPurchases: 5,
  minSearchVolume: 500,
  minImpressions: 0,
  minCartAdds: 0,
}

/** Per-strategy default filter settings */
export const STRATEGY_DEFAULT_THRESHOLDS: Record<
  StrategyId,
  { minClicks: number; minPurchases: number; minSearchVolume: number; minImpressions: number; minCartAdds: number }
> = {
  overview: { minClicks: 30, minPurchases: 5, minSearchVolume: 500, minImpressions: 0, minCartAdds: 0 },
  defendWinners: { minClicks: 30, minPurchases: 5, minSearchVolume: 500, minImpressions: 0, minCartAdds: 0 },
  scaleConverters: { minClicks: 25, minPurchases: 3, minSearchVolume: 300, minImpressions: 0, minCartAdds: 0 },
  visibilityGaps: { minClicks: 10, minPurchases: 0, minSearchVolume: 700, minImpressions: 0, minCartAdds: 0 },
  clickLeak: { minClicks: 25, minPurchases: 1, minSearchVolume: 300, minImpressions: 0, minCartAdds: 0 },
  cartAddFriction: { minClicks: 20, minPurchases: 1, minSearchVolume: 300, minImpressions: 0, minCartAdds: 0 },
  keywordScoring: { minClicks: 15, minPurchases: 2, minSearchVolume: 200, minImpressions: 0, minCartAdds: 0 },
}

export interface StrategyRow {
  row: SQPRowWithMetrics
  recommended: string
  tags: string[]
}

export interface StrategyInfo {
  id: StrategyId
  label: string
  description: string
  requiredColumns: string[]
}

export const STRATEGY_INFO: Record<StrategyId, StrategyInfo> = {
  overview: {
    id: 'overview',
    label: 'Overview',
    description: 'Summary KPIs across all search queries.',
    requiredColumns: ['query', 'impressions/clicks/purchases or shares'],
  },
  defendWinners: {
    id: 'defendWinners',
    label: 'Defend Winners',
    description: 'High Purchase Share — terms where you already win. Protect with exact match, higher bids, top of search.',
    requiredColumns: ['query', 'purchaseShare', 'clicks', 'purchases'],
  },
  scaleConverters: {
    id: 'scaleConverters',
    label: 'Scale Converters',
    description: 'High Purchase Rate — terms that convert well. Scale with exact + phrase, increase budget, top of search.',
    requiredColumns: ['query', 'purchaseRate', 'clicks', 'purchases'],
  },
  visibilityGaps: {
    id: 'visibilityGaps',
    label: 'Visibility Gaps',
    description: 'High Market Purchases + Low Impression Share — opportunity to capture demand with exact for core terms, phrase for discovery, Sponsored Brands.',
    requiredColumns: ['query', 'marketPurchases', 'impressionShare'],
  },
  clickLeak: {
    id: 'clickLeak',
    label: 'Click Leak',
    description: 'High Click Share but Low Purchase Share — you get clicks but lose conversions. Prioritize listing improvements (images, price, coupon, reviews, A+), test product targeting defensive.',
    requiredColumns: ['query', 'clickShare', 'purchaseShare'],
  },
  cartAddFriction: {
    id: 'cartAddFriction',
    label: 'Cart Add Friction',
    description: 'High Cart Add Rate but Low Purchase Rate — carts add but don\'t convert. Test coupon/price, improve delivery promise, add trust signals, retarget with Sponsored Display.',
    requiredColumns: ['query', 'cartAddRate', 'purchaseRate', 'clicks'],
  },
  keywordScoring: {
    id: 'keywordScoring',
    label: 'Keyword Scoring',
    description: 'Advanced combined Profit Score. Build a core keyword portfolio from top opportunities.',
    requiredColumns: ['query', 'searchVolume', 'purchaseRate', 'purchaseShare', 'impressionShare'],
  },
}

function filterByThresholds(
  rows: SQPRowWithMetrics[],
  cfg: StrategyConfig
): SQPRowWithMetrics[] {
  const minC = Number(cfg.minClicks) || 0
  const minP = Number(cfg.minPurchases) || 0
  const minV = Number(cfg.minSearchVolume) || 0
  const minI = Number(cfg.minImpressions) || 0
  const minA = Number(cfg.minCartAdds) || 0
  return rows.filter(
    (r) =>
      r.query &&
      Number(r.clicks) >= minC &&
      Number(r.purchases) >= minP &&
      Number(r.searchVolume) >= minV &&
      Number(r.impressions) >= minI &&
      Number(r.cartAdds) >= minA
  )
}

export function runDefendWinners(
  rows: SQPRowWithMetrics[],
  cfg: StrategyConfig
): StrategyRow[] {
  const min = cfg.minPurchaseShare ?? 0.15
  const filtered = filterByThresholds(rows, cfg).filter(
    (r) => r.purchaseShare >= min
  )
  const sorted = [...filtered].sort((a, b) => b.purchaseShare - a.purchaseShare)
  return sorted.map((r) => ({
    row: r,
    recommended:
      'Sponsored Products exact, raise bids, top of search multiplier, Sponsored Brands defense.',
    tags: ['Defend'],
  }))
}

export function runScaleConverters(
  rows: SQPRowWithMetrics[],
  cfg: StrategyConfig
): StrategyRow[] {
  const minRate = cfg.minPurchaseRate ?? 0.08
  const minC = Number(cfg.minClicks) || 0
  const minP = Number(cfg.minPurchases) || 0
  const minV = Number(cfg.minSearchVolume) || 0
  const minI = Number(cfg.minImpressions) || 0
  const minA = Number(cfg.minCartAdds) || 0
  const filtered = rows.filter(
    (r) =>
      r.query &&
      Number(r.clicks) >= minC &&
      Number(r.purchases) >= minP &&
      Number(r.searchVolume) >= minV &&
      Number(r.impressions) >= minI &&
      Number(r.cartAdds) >= minA &&
      r.purchaseRate >= minRate
  )
  const sorted = [...filtered].sort((a, b) => b.purchaseRate - a.purchaseRate)
  return sorted.map((r) => ({
    row: r,
    recommended: 'Exact + phrase, increase budget, top of search.',
    tags: ['Scale'],
  }))
}

export function runVisibilityGaps(
  rows: SQPRowWithMetrics[],
  cfg: StrategyConfig
): StrategyRow[] {
  const minC = Number(cfg.minClicks) || 0
  const minP = Number(cfg.minPurchases) || 0
  const minV = Number(cfg.minSearchVolume) || 0
  const minI = Number(cfg.minImpressions) || 0
  const minA = Number(cfg.minCartAdds) || 0
  const filtered = rows.filter(
    (r) =>
      r.query &&
      Number(r.clicks) >= minC &&
      Number(r.marketPurchases) >= minP &&
      Number(r.searchVolume) >= minV &&
      Number(r.impressions) >= minI &&
      Number(r.cartAdds) >= minA &&
      r.impressionShare < 0.5 &&
      r.opportunityScore > 0
  )
  const sorted = [...filtered].sort(
    (a, b) => b.opportunityScore - a.opportunityScore
  )
  return sorted.map((r) => ({
    row: r,
    recommended:
      'Launch exact for core terms, phrase for discovery, consider Sponsored Brands.',
    tags: ['Opportunity'],
  }))
}

export function runClickLeak(
  rows: SQPRowWithMetrics[],
  cfg: StrategyConfig
): StrategyRow[] {
  const filtered = filterByThresholds(rows, cfg).filter(
    (r) => r.leakScore > 0.05
  )
  const sorted = [...filtered].sort((a, b) => b.leakScore - a.leakScore)
  return sorted.map((r) => ({
    row: r,
    recommended:
      'Keep PPC but prioritize listing improvements (images, price, coupon, reviews, A+), test product targeting defensive.',
    tags: ['Leak'],
  }))
}

export function runCartAddFriction(
  rows: SQPRowWithMetrics[],
  cfg: StrategyConfig
): StrategyRow[] {
  const minCart = cfg.minCartAddRate ?? 0.08
  const maxPurchase = cfg.minPurchaseRate ?? 0.05
  const filtered = filterByThresholds(rows, cfg).filter(
    (r) => r.cartAddRate >= minCart && r.purchaseRate < maxPurchase
  )
  const sorted = [...filtered].sort((a, b) => b.cartAddRate - a.cartAddRate)
  return sorted.map((r) => ({
    row: r,
    recommended:
      'Coupon/price test, improve delivery promise, add trust signals, retarget with Sponsored Display.',
    tags: ['Friction'],
  }))
}

export function runKeywordScoring(
  rows: SQPRowWithMetrics[],
  cfg: StrategyConfig
): StrategyRow[] {
  const filtered = filterByThresholds(rows, cfg).filter(
    (r) => r.profitScore > 0
  )
  const sorted = [...filtered].sort((a, b) => b.profitScore - a.profitScore)
  return sorted.map((r) => ({
    row: r,
    recommended: 'Build core keyword portfolio.',
    tags: ['Score'],
  }))
}

export function runStrategy(
  strategyId: StrategyId,
  rows: SQPRowWithMetrics[],
  cfg: StrategyConfig
): StrategyRow[] {
  switch (strategyId) {
    case 'defendWinners':
      return runDefendWinners(rows, cfg)
    case 'scaleConverters':
      return runScaleConverters(rows, cfg)
    case 'visibilityGaps':
      return runVisibilityGaps(rows, cfg)
    case 'clickLeak':
      return runClickLeak(rows, cfg)
    case 'cartAddFriction':
      return runCartAddFriction(rows, cfg)
    case 'keywordScoring':
      return runKeywordScoring(rows, cfg)
    case 'overview':
    default:
      return filterByThresholds(rows, cfg).map((r) => ({
        row: r,
        recommended: '-',
        tags: [],
      }))
  }
}
