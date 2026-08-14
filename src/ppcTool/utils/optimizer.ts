/**
 * PPC optimization logic aligned with Amazon Ads design and partner best practices.
 * Layer 1: Base bid (Target ACoS formula: Bidbear, AdLabs)
 * Layer 2: Placement adjustments (traffic distribution per Amazon placement controls)
 * Conservative caps to avoid killing impression share.
 */

import type { ExtractedPlacementData, PlacementRow } from './placementParser'

export interface AdLevelMetrics {
  bid: number
  impressions: number
  clicks: number
  totalCost: number
  cpc: number
  purchases: number
  sales: number
  acos: number
}

export interface PlacementMetrics {
  bidAdjustment: number
  impressions: number
  clicks: number
  totalCost: number
  cpc: number
  purchases: number
  sales: number
  acos: number
}

export interface OptimizationResult {
  layer1: {
    suggestedBaseBid: number
    changePercent: number
    status: 'profitable' | 'unprofitable' | 'on-target' | 'insufficient-data' | 'low-visibility'
    rationale: string
    economicMaxCpc: number
    roas: number
    targetRoas: number
    cvr: number
  }
  layer2: {
    topOfSearch: { suggestedAdjustment: number; changePercent: number; rationale: string }
    restOfSearch: { suggestedAdjustment: number; changePercent: number; rationale: string }
    productPages: { suggestedAdjustment: number; changePercent: number; rationale: string }
    hasPlacementData: boolean
  }
}

const MAX_BID_CHANGE_PCT = 20
/** Expert practice: move placement multipliers in small steps (~10–25%), not 50% jumps. */
const MAX_PLACEMENT_CHANGE_PCT = 25
const MIN_PLACEMENT_ADJ = 0 // Amazon Sponsored Products floor (no negative placement %)
const MAX_PLACEMENT_ADJ = 900
/** Wait for enough placement clicks before changing multipliers (noise control). */
const MIN_PLACEMENT_CLICKS = 20
const MIN_BID = 0.02
const LOW_IMPRESSION_THRESHOLD = 100

/**
 * Placement amplify guard (expert practice):
 * Only block further increases when this placement's CPC already exceeds what
 * its own revenue-per-click can afford at target ACoS.
 * Does not force cuts on profitable placements (ACOS gate handles cuts).
 */
function canAmplifyPlacement(
  placeCpc: number,
  placeSales: number,
  placeClicks: number,
  targetAcosDecimal: number
): boolean {
  if (!(placeClicks > 0) || !(placeSales > 0) || !(targetAcosDecimal > 0)) return true
  const placeRpc = placeSales / placeClicks
  const placeEconMaxCpc = placeRpc * targetAcosDecimal
  if (!(placeEconMaxCpc > 0)) return true
  return !(placeCpc > placeEconMaxCpc * 1.2)
}

function parseNum(s: string): number {
  if (!s || typeof s !== 'string') return 0
  const cleaned = s.replace(/[$,£%\s]/g, '')
  return parseFloat(cleaned) || 0
}

/** ACOS: 0.4216 (decimal) → 42.16, 42.16 (percent) → 42.16 */
function parseAcos(s: string): number {
  const n = parseNum(s)
  if (n > 0 && n < 1) return n * 100
  return n
}

function parseAdLevelMetrics(data: Record<string, string>): AdLevelMetrics | null {
  const bid = parseNum(data.bid ?? '')
  const clicks = parseNum(data.clicks ?? '')
  const totalCost = parseNum(data.totalCost ?? '')
  const sales = parseNum(data.sales ?? '')
  const purchases = parseNum(data.purchases ?? '')

  if (!bid || !clicks) return null

  const cpc = parseNum(data.cpc ?? '') || (totalCost && clicks ? totalCost / clicks : 0)
  const acos = parseAcos(data.acos ?? '') || (totalCost && sales ? (totalCost / sales) * 100 : 0)
  const impressions = parseNum(data.impressions ?? '')

  return {
    bid,
    impressions,
    clicks,
    totalCost: totalCost || cpc * clicks,
    cpc,
    purchases,
    sales,
    acos,
  }
}

function parsePlacementRow(row: PlacementRow): PlacementMetrics | null {
  const clicks = parseNum(row.clicks ?? '')
  const totalCost = parseNum(row.totalCost ?? '')
  const sales = parseNum(row.sales ?? '')
  if (clicks === 0 && totalCost === 0) return null

  const bidAdjustment = parseNum(row.bidAdjustment ?? '')
  const acos = parseAcos(row.acos ?? '') || (totalCost && sales ? (totalCost / sales) * 100 : 0)
  const cpc = parseNum(row.cpc ?? '') || (totalCost && clicks ? totalCost / clicks : 0)

  return {
    bidAdjustment: bidAdjustment || 0,
    impressions: parseNum(row.impressions ?? ''),
    clicks,
    totalCost,
    cpc,
    purchases: parseNum(row.purchases ?? ''),
    sales,
    acos,
  }
}

export function optimize(
  adLevelData: Record<string, string>,
  placementData: ExtractedPlacementData | null,
  targetAcosPct: number
): OptimizationResult | null {
  const ad = parseAdLevelMetrics(adLevelData)
  if (!ad) return null

  const targetAcos = targetAcosPct / 100
  const targetRoas = 1 / targetAcos

  const revenuePerClick = ad.clicks > 0 ? ad.sales / ad.clicks : 0
  const economicMaxCpc = revenuePerClick * targetAcos
  const roas = ad.totalCost > 0 ? ad.sales / ad.totalCost : 0
  const cvr = ad.clicks > 0 ? ad.purchases / ad.clicks : 0

  let suggestedBaseBid = ad.bid
  let status: OptimizationResult['layer1']['status'] = 'insufficient-data'
  let rationale = ''

  if (ad.sales > 0 && ad.totalCost > 0) {
    const currentAcos = ad.totalCost / ad.sales
    const currentAcosPct = currentAcos * 100

    if (ad.impressions > 0 && ad.impressions < LOW_IMPRESSION_THRESHOLD) {
      status = 'low-visibility'
      rationale = `Low visibility (${ad.impressions} impressions). Consider increasing bid to test; monitor closely.`
      suggestedBaseBid = Math.min(ad.bid * 1.15, economicMaxCpc)
      suggestedBaseBid = Math.max(MIN_BID, Math.round(suggestedBaseBid * 100) / 100)
    } else if (currentAcos <= targetAcos * 0.9) {
      status = 'profitable'
      rationale = `ACoS ${currentAcosPct.toFixed(1)}% is below target ${targetAcosPct}%. Keyword is profitable.`
      const formulaBid = (targetAcos / currentAcos) * ad.bid
      const cappedBid = Math.min(formulaBid, ad.bid * (1 + MAX_BID_CHANGE_PCT / 100), economicMaxCpc * 1.05)
      suggestedBaseBid = Math.max(cappedBid, ad.bid)
      suggestedBaseBid = Math.min(suggestedBaseBid, economicMaxCpc * 1.1)
      suggestedBaseBid = Math.max(MIN_BID, Math.round(suggestedBaseBid * 100) / 100)
    } else if (currentAcos >= targetAcos * 1.1) {
      status = 'unprofitable'
      rationale = `ACoS ${currentAcosPct.toFixed(1)}% exceeds target ${targetAcosPct}%. Reduce bid to improve profitability.`
      const formulaBid = (targetAcos / currentAcos) * ad.bid
      const floorBid = Math.max(economicMaxCpc * 0.5, MIN_BID)
      const cappedBid = Math.max(formulaBid, ad.bid * (1 - MAX_BID_CHANGE_PCT / 100), floorBid)
      suggestedBaseBid = Math.min(cappedBid, ad.bid)
      suggestedBaseBid = Math.max(suggestedBaseBid, floorBid)
      suggestedBaseBid = Math.max(MIN_BID, Math.round(suggestedBaseBid * 100) / 100)
    } else {
      status = 'on-target'
      rationale = `ACoS ${currentAcosPct.toFixed(1)}% is near target ${targetAcosPct}%. Maintain stability.`
      suggestedBaseBid = ad.bid
    }
  } else {
    rationale = 'Insufficient sales or spend data. Add placement data or ensure ad-level metrics are complete.'
  }

  const changePercent = ad.bid > 0 ? ((suggestedBaseBid - ad.bid) / ad.bid) * 100 : 0

  const layer2Result: OptimizationResult['layer2'] = {
    topOfSearch: { suggestedAdjustment: 0, changePercent: 0, rationale: '' },
    restOfSearch: { suggestedAdjustment: 0, changePercent: 0, rationale: '' },
    productPages: { suggestedAdjustment: 0, changePercent: 0, rationale: '' },
    hasPlacementData: false,
  }

  if (placementData) {
    layer2Result.hasPlacementData = true

    const top = parsePlacementRow(placementData.topOfSearch)
    const rest = parsePlacementRow(placementData.restOfSearch)
    const product = parsePlacementRow(placementData.productPages)

    const placements = [
      { key: 'topOfSearch' as const, data: top, row: placementData.topOfSearch, label: 'Top of Search' },
      { key: 'restOfSearch' as const, data: rest, row: placementData.restOfSearch, label: 'Rest of Search' },
      { key: 'productPages' as const, data: product, row: placementData.productPages, label: 'Product Pages' },
    ]

    for (const { key, data, row, label } of placements) {
      if (!data) {
        layer2Result[key] = {
          suggestedAdjustment: Math.max(MIN_PLACEMENT_ADJ, parseNum(row.bidAdjustment ?? '') || 0),
          changePercent: 0,
          rationale: 'No data for this placement.',
        }
        continue
      }

      const currentAdj = Math.max(MIN_PLACEMENT_ADJ, data.bidAdjustment)
      let suggestedAdj = currentAdj
      let placeRationale = ''

      if (data.clicks > 0 && data.clicks < MIN_PLACEMENT_CLICKS) {
        placeRationale = `Only ${data.clicks} clicks (need ≥${MIN_PLACEMENT_CLICKS}). Maintain current adjustment until more data.`
      } else if (data.sales > 0 && data.totalCost > 0) {
        const placeAcos = (data.totalCost / data.sales) * 100
        const isProfitablePlacement = placeAcos < targetAcosPct * 0.9
        const isUnprofitablePlacement = placeAcos > targetAcosPct * 1.1

        if (isProfitablePlacement) {
          // Conservative amplify: 10 / 15 / 25 max per cycle (expert cadence)
          const baseIncrease =
            placeAcos < targetAcosPct * 0.5 ? 25 : placeAcos < targetAcosPct * 0.7 ? 15 : 10
          const increase = Math.min(MAX_PLACEMENT_CHANGE_PCT, baseIncrease)
          if (!canAmplifyPlacement(data.cpc, data.sales, data.clicks, targetAcos)) {
            suggestedAdj = currentAdj
            placeRationale = `ACoS ${placeAcos.toFixed(1)}% below target ${targetAcosPct}%, but placement CPC already above affordable CPC for this placement. Hold adjustment.`
          } else {
            suggestedAdj = Math.min(currentAdj + increase, MAX_PLACEMENT_ADJ)
            if (key === 'restOfSearch') {
              placeRationale = `ACoS ${placeAcos.toFixed(1)}% below target ${targetAcosPct}%. Small Rest of Search boost; Rest volume is still mainly controlled by base bid.`
            } else {
              placeRationale = `ACoS ${placeAcos.toFixed(1)}% below target ${targetAcosPct}%. Amplify ${label} (+${increase} pts this cycle).`
            }
          }
        } else if (isUnprofitablePlacement) {
          // Cut toward Amazon floor 0% in 15–25 pt steps — never negative
          const decrease = placeAcos > targetAcosPct * 1.5 ? 25 : 15
          suggestedAdj = Math.max(MIN_PLACEMENT_ADJ, currentAdj - decrease)
          if (key === 'restOfSearch') {
            placeRationale =
              suggestedAdj === 0 && currentAdj === 0
                ? `Placement ACoS ${placeAcos.toFixed(1)}% exceeds target ${targetAcosPct}%. Rest of Search already at 0% — reduce exposure via base bid (Layer 1).`
                : `Placement ACoS ${placeAcos.toFixed(1)}% exceeds target ${targetAcosPct}%. Cut Rest of Search toward 0% (Amazon floor); further control is via base bid.`
          } else {
            placeRationale =
              suggestedAdj === 0
                ? `Placement ACoS ${placeAcos.toFixed(1)}% exceeds target ${targetAcosPct}%. Set ${label} to 0% (Amazon minimum).`
                : `Placement ACoS ${placeAcos.toFixed(1)}% exceeds target ${targetAcosPct}%. Reduce ${label} toward 0% (−${decrease} pts this cycle).`
          }
        } else {
          placeRationale = `ACoS ${placeAcos.toFixed(1)}% near target ${targetAcosPct}%. Maintain current adjustment.`
        }
      } else if (data.clicks > 0 || data.totalCost > 0) {
        placeRationale = 'Limited conversion data. Maintain current adjustment.'
      }

      suggestedAdj = Math.round(suggestedAdj)
      suggestedAdj = Math.max(MIN_PLACEMENT_ADJ, Math.min(MAX_PLACEMENT_ADJ, suggestedAdj))

      layer2Result[key] = {
        suggestedAdjustment: suggestedAdj,
        changePercent: currentAdj !== 0 ? ((suggestedAdj - currentAdj) / Math.abs(currentAdj)) * 100 : 0,
        rationale: placeRationale,
      }
    }
  }

  return {
    layer1: {
      suggestedBaseBid,
      changePercent,
      status,
      rationale,
      economicMaxCpc,
      roas,
      targetRoas,
      cvr,
    },
    layer2: layer2Result,
  }
}
