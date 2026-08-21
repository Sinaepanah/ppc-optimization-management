/**
 * Bulk PPC optimization for multiple keywords.
 * Applies Target ACoS-based bid optimization per keyword.
 * Aligned with Amazon PPC best practices: profitable, conservative, consistent.
 */

import type { KeywordRow } from './keywordCsvParser'
import { deriveMissingKeywordMetrics } from './deriveMissingMetrics'

export interface KeywordOptimization {
  rowIndex: number
  keyword: string
  campaign?: string
  adGroup?: string
  matchType?: string
  currentBid: number
  suggestedBid: number
  changePercent: number
  status: 'profitable' | 'unprofitable' | 'on-target' | 'insufficient-data' | 'low-visibility' | 'no-bid' | 'no-traffic' | 'no-conversions' | 'zero-sales-decrease' | 'zero-sales-increase'
  rationale: string
  impressions: number
  clicks: number
  orders: number
  cvr: number
  spend: number
  sales: number
  acos: number
  roas: number
}

const MAX_BID_CHANGE_PCT = 20
const MAX_BID_REDUCTION_PCT = 50
const MIN_BID = 0.02
const LOW_IMPRESSION_THRESHOLD = 50
const NO_CONVERSION_CLICK_THRESHOLD = 10

function parseNum(s: string | undefined): number {
  if (!s || typeof s !== 'string') return 0
  const cleaned = s.replace(/[$,£%\s]/g, '')
  return parseFloat(cleaned) || 0
}

/** Amazon exports ACOS as decimal ratio: 0.7254 = 72.54%, 1.3234 = 132.34%. */
function parseAcos(s: string | undefined): number {
  const n = parseNum(s)
  if (n > 0 && n < 10) return n * 100
  return n
}

export function optimizeKeyword(
  row: KeywordRow,
  rowIndex: number,
  targetAcosPct: number
): KeywordOptimization | null {
  const filled = deriveMissingKeywordMetrics(row)
  const bid = parseNum(filled.bid)
  const clicks = parseNum(filled.clicks)
  const spend = parseNum(filled.spend)
  const sales = parseNum(filled.sales)
  const orders = parseNum(filled.orders)
  const impressions = parseNum(filled.impressions)
  const acosRaw = parseAcos(filled.acos)
  const acos = acosRaw || (spend > 0 && sales > 0 ? (spend / sales) * 100 : 0)
  const roas = spend > 0 ? sales / spend : 0
  const cvrRaw = parseNum(filled.cvr)
  const cvr = cvrRaw > 0 ? cvrRaw : (clicks > 0 && orders > 0 ? (orders / clicks) * 100 : 0)

  const keyword = (filled.keyword ?? filled.raw['Keyword'] ?? filled.raw['Targeting'] ?? '').trim() || `Row ${rowIndex + 1}`

  if (bid <= 0) {
    return {
      rowIndex,
      keyword,
      campaign: filled.campaign,
      adGroup: filled.adGroup,
      matchType: filled.matchType,
      currentBid: 0,
      suggestedBid: MIN_BID,
      changePercent: 0,
      status: 'no-bid',
      rationale: 'No bid data. Set a starting bid to test.',
      impressions,
      clicks,
      orders,
      cvr,
      spend,
      sales,
      acos,
      roas,
    }
  }

  const targetAcos = targetAcosPct / 100
  const revenuePerClick = clicks > 0 ? sales / clicks : 0
  const economicMaxCpc = revenuePerClick * targetAcos
  const ctrPct = impressions > 0 ? (clicks / impressions) * 100 : 0

  let suggestedBid = bid
  let status: KeywordOptimization['status'] = 'insufficient-data'
  let rationale = ''

  // ========== ZERO-ORDER KEYWORDS ONLY: Amazon PPC optimization engine rules ==========
  if (orders === 0) {
    let ruleApplied = false

    // Rule 6: High Spend Without Sales — spend > $15, no orders
    if (spend > 15 && !ruleApplied) {
      status = 'zero-sales-decrease'
      rationale = `High spend ($${spend.toFixed(2)}) with zero orders. Decrease bid to reduce cost.`
      suggestedBid = Math.max(bid * 0.6, MIN_BID)
      suggestedBid = Math.round(suggestedBid * 100) / 100
      ruleApplied = true
    }

    // Rule 1: High Impressions + Low CTR — traffic rejecting the ad
    if (impressions > 1000 && ctrPct < 0.3 && !ruleApplied) {
      status = 'zero-sales-decrease'
      rationale = `High impressions (${impressions.toLocaleString()}) but low CTR (${ctrPct.toFixed(2)}%). Shoppers ignoring ad. Decrease bid 30–50%.`
      suggestedBid = Math.max(bid * 0.5, MIN_BID)
      suggestedBid = Math.round(suggestedBid * 100) / 100
      ruleApplied = true
    }

    // Rule 2: Moderate Impressions + Weak CTR
    if (impressions >= 300 && impressions <= 1000 && ctrPct < 0.25 && !ruleApplied) {
      status = 'zero-sales-decrease'
      rationale = `Moderate impressions (${impressions.toLocaleString()}), weak CTR (${ctrPct.toFixed(2)}%). Engagement weak. Decrease bid 20–30%.`
      suggestedBid = Math.max(bid * 0.75, MIN_BID)
      suggestedBid = Math.round(suggestedBid * 100) / 100
      ruleApplied = true
    }

    // Rule 4: Good CTR but 10–20 Clicks with No Sales
    if (ctrPct >= 0.6 && clicks >= 10 && clicks <= 20 && !ruleApplied) {
      status = 'zero-sales-decrease'
      rationale = `Good CTR (${ctrPct.toFixed(2)}%) but ${clicks} clicks with no sales. Decrease bid 10% to reduce cost while testing.`
      suggestedBid = Math.max(bid * 0.9, MIN_BID)
      suggestedBid = Math.round(suggestedBid * 100) / 100
      ruleApplied = true
    }

    // Rule 3: Good CTR but No Sales (Not Enough Data Yet)
    if (ctrPct >= 0.6 && clicks < 10 && !ruleApplied) {
      status = 'zero-sales-increase'
      rationale = `Good CTR (${ctrPct.toFixed(2)}%), ${clicks} clicks — not enough data yet. Increase bid 10–20% to gain more data.`
      suggestedBid = Math.min(bid * 1.2, bid + 0.5)
      suggestedBid = Math.max(MIN_BID, Math.round(suggestedBid * 100) / 100)
      ruleApplied = true
    }

    // Rule 5: Very Low Impressions — keyword not entering auctions
    if (impressions < 200 && impressions > 0 && !ruleApplied) {
      status = 'zero-sales-increase'
      rationale = `Very low impressions (${impressions}). Bid likely too low to compete. Increase bid 20–40%.`
      suggestedBid = Math.min(bid * 1.3, bid + 0.4)
      suggestedBid = Math.max(MIN_BID, Math.round(suggestedBid * 100) / 100)
      ruleApplied = true
    }

    // Fallback for zero-order: no-traffic (impressions ~0)
    if (impressions < 10 && clicks < 5 && !ruleApplied) {
      status = 'zero-sales-increase'
      rationale = `No meaningful traffic. Bid may be too low. Increase bid 20–40% to test.`
      suggestedBid = Math.min(bid * 1.3, bid + 0.25)
      suggestedBid = Math.max(MIN_BID, Math.round(suggestedBid * 100) / 100)
      ruleApplied = true
    }

    // Zero-order but none of the rules matched (e.g. 20+ clicks, moderate CTR)
    if (!ruleApplied && orders === 0) {
      status = 'zero-sales-decrease'
      rationale = `${clicks} clicks, $${spend.toFixed(2)} spend, zero sales. Decrease bid to limit wasteful spend.`
      suggestedBid = Math.max(bid * 0.7, MIN_BID)
      suggestedBid = Math.round(suggestedBid * 100) / 100
    }
  }
  // ========== KEYWORDS WITH 1+ ORDERS: existing logic unchanged ==========
  else if (impressions < 10 && clicks < 5) {
    status = 'no-traffic'
    rationale = `No meaningful traffic (${impressions} impr., ${clicks} clicks). Bid may be too low to compete. Increase bid to test visibility.`
    suggestedBid = bid * 1.15
    suggestedBid = Math.max(MIN_BID, Math.round(suggestedBid * 100) / 100)
  }
  else if (clicks >= NO_CONVERSION_CLICK_THRESHOLD && sales <= 0 && spend > 0) {
    status = 'no-conversions'
    rationale = `${clicks} clicks, $${spend.toFixed(2)} spend, zero sales. Reduce bid to limit wasteful spend. Consider negative keyword if persistently poor.`
    const reduction = Math.min(MAX_BID_REDUCTION_PCT, 30 + Math.min(clicks / 5, 20))
    suggestedBid = Math.max(bid * (1 - reduction / 100), MIN_BID)
    suggestedBid = Math.round(suggestedBid * 100) / 100
  }
  else if (sales > 0 && spend > 0) {
    const currentAcos = spend / sales
    const currentAcosPct = currentAcos * 100

    if (impressions > 0 && impressions < LOW_IMPRESSION_THRESHOLD) {
      status = 'low-visibility'
      rationale = `Low visibility (${impressions} impressions). Consider small bid increase to test.`
      suggestedBid = Math.min(bid * 1.1, economicMaxCpc || bid * 1.2)
      suggestedBid = Math.max(MIN_BID, Math.round(suggestedBid * 100) / 100)
    } else if (currentAcos <= targetAcos * 0.9) {
      status = 'profitable'
      rationale = `ACoS ${currentAcosPct.toFixed(1)}% below target. Profitable — can increase bid.`
      const formulaBid = (targetAcos / currentAcos) * bid
      const cappedBid = Math.min(
        formulaBid,
        bid * (1 + MAX_BID_CHANGE_PCT / 100),
        (economicMaxCpc || bid * 2) * 1.05
      )
      suggestedBid = Math.max(cappedBid, bid)
      suggestedBid = Math.min(suggestedBid, (economicMaxCpc || bid * 2) * 1.1)
      suggestedBid = Math.max(MIN_BID, Math.round(suggestedBid * 100) / 100)
    } else if (currentAcos >= targetAcos * 1.1) {
      status = 'unprofitable'
      rationale = `ACoS ${currentAcosPct.toFixed(1)}% exceeds target. Reduce bid to improve profitability.`
      const formulaBid = (targetAcos / currentAcos) * bid
      const floorBid = Math.max(economicMaxCpc * 0.5, MIN_BID)
      const cappedBid = Math.max(formulaBid, bid * (1 - MAX_BID_CHANGE_PCT / 100), floorBid)
      suggestedBid = Math.min(cappedBid, bid)
      suggestedBid = Math.max(suggestedBid, floorBid)
      suggestedBid = Math.max(MIN_BID, Math.round(suggestedBid * 100) / 100)
    } else {
      status = 'on-target'
      rationale = `ACoS ${currentAcosPct.toFixed(1)}% near target. Maintain stability.`
      suggestedBid = bid
    }
  } else if (clicks > 0 && clicks < NO_CONVERSION_CLICK_THRESHOLD && sales <= 0) {
    status = 'insufficient-data'
    rationale = `${clicks} clicks, no sales yet. Need more data. Maintain bid and monitor — consider reducing if no conversions after 20+ clicks.`
    suggestedBid = bid
  } else if (clicks > 0 || spend > 0) {
    rationale = 'Insufficient sales data. Maintain current bid and monitor.'
    suggestedBid = bid
  } else {
    rationale = 'No performance data. Maintain or set a test bid.'
    suggestedBid = bid
  }

  const changePercent = bid > 0 ? ((suggestedBid - bid) / bid) * 100 : 0

  return {
    rowIndex,
    keyword,
    campaign: filled.campaign,
    adGroup: filled.adGroup,
    matchType: filled.matchType,
    currentBid: bid,
    suggestedBid,
    changePercent,
    status,
    rationale,
    impressions,
    clicks,
    orders,
    cvr,
    spend,
    sales,
    acos,
    roas,
  }
}

export function optimizeBulk(
  rows: KeywordRow[],
  targetAcosPct: number
): KeywordOptimization[] {
  return rows
    .map((row, i) => optimizeKeyword(row, i, targetAcosPct))
    .filter((r): r is KeywordOptimization => r != null)
}
