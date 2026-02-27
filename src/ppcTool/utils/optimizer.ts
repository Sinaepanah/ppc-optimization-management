/**
 * Two-layer PPC optimization logic.
 * Layer 1: Base bid (ad-level profitability)
 * Layer 2: Placement bid adjustments (traffic distribution)
 * Uses conservative caps to avoid killing impression share.
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
    status: 'profitable' | 'unprofitable' | 'on-target' | 'insufficient-data'
    rationale: string
    economicMaxCpc: number
    roas: number
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
const MAX_PLACEMENT_CHANGE_PCT = 25
const MIN_BID = 0.02

function parseNum(s: string): number {
  if (!s || typeof s !== 'string') return 0
  const cleaned = s.replace(/[$,£%\s]/g, '')
  return parseFloat(cleaned) || 0
}

function parseAdLevelMetrics(data: Record<string, string>): AdLevelMetrics | null {
  const bid = parseNum(data.bid ?? '')
  const clicks = parseNum(data.clicks ?? '')
  const totalCost = parseNum(data.totalCost ?? '')
  const sales = parseNum(data.sales ?? '')
  const purchases = parseNum(data.purchases ?? '')

  if (!bid || !clicks) return null

  const cpc = parseNum(data.cpc ?? '') || (totalCost && clicks ? totalCost / clicks : 0)
  const acos = parseNum(data.acos ?? '') || (totalCost && sales ? (totalCost / sales) * 100 : 0)
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
  const acos = parseNum(row.acos ?? '') || (totalCost && sales ? (totalCost / sales) * 100 : 0)
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

  const revenuePerClick = ad.clicks > 0 ? ad.sales / ad.clicks : 0
  const economicMaxCpc = revenuePerClick * targetAcos
  const roas = ad.totalCost > 0 ? ad.sales / ad.totalCost : 0
  const cvr = ad.clicks > 0 ? ad.purchases / ad.clicks : 0

  let suggestedBaseBid = ad.bid
  let status: OptimizationResult['layer1']['status'] = 'insufficient-data'
  let rationale = ''

  if (ad.sales > 0 && ad.totalCost > 0) {
    const currentAcos = ad.totalCost / ad.sales

    if (currentAcos <= targetAcos * 0.9) {
      status = 'profitable'
      rationale = `ACoS ${(currentAcos * 100).toFixed(1)}% is below target ${targetAcosPct}%. Keyword is profitable.`
      const optimalBid = Math.min(economicMaxCpc, ad.bid * 1.2)
      const increase = Math.min((optimalBid - ad.bid) / ad.bid, MAX_BID_CHANGE_PCT / 100)
      suggestedBaseBid = Math.min(ad.bid * (1 + increase), economicMaxCpc * 1.1)
      suggestedBaseBid = Math.max(suggestedBaseBid, ad.bid)
    } else if (currentAcos >= targetAcos * 1.2) {
      status = 'unprofitable'
      rationale = `ACoS ${(currentAcos * 100).toFixed(1)}% exceeds target ${targetAcosPct}%. Reduce bid to improve profitability.`
      const floorBid = Math.max(economicMaxCpc * 0.5, MIN_BID)
      const decrease = Math.min((ad.bid - floorBid) / ad.bid, MAX_BID_CHANGE_PCT / 100)
      suggestedBaseBid = Math.max(ad.bid * (1 - decrease), floorBid)
      suggestedBaseBid = Math.min(suggestedBaseBid, ad.bid)
    } else {
      status = 'on-target'
      rationale = `ACoS ${(currentAcos * 100).toFixed(1)}% is near target ${targetAcosPct}%. Maintain stability.`
      suggestedBaseBid = ad.bid
    }

    suggestedBaseBid = Math.max(MIN_BID, Math.round(suggestedBaseBid * 100) / 100)
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

  if (placementData && status !== 'unprofitable') {
    layer2Result.hasPlacementData = true

    const top = parsePlacementRow(placementData.topOfSearch)
    const rest = parsePlacementRow(placementData.restOfSearch)
    const product = parsePlacementRow(placementData.productPages)

    const placements = [
      { key: 'topOfSearch' as const, data: top, row: placementData.topOfSearch },
      { key: 'restOfSearch' as const, data: rest, row: placementData.restOfSearch },
      { key: 'productPages' as const, data: product, row: placementData.productPages },
    ]

    const validPlacements = placements.filter((p) => p.data && (p.data.clicks > 0 || p.data.totalCost > 0))
    const avgRoas = validPlacements.length > 0
      ? validPlacements.reduce((s, p) => s + (p.data!.sales / (p.data!.totalCost || 1)), 0) / validPlacements.length
      : 0

    for (const { key, data, row } of placements) {
      if (!data) {
        layer2Result[key] = {
          suggestedAdjustment: parseNum(row.bidAdjustment ?? '') || 0,
          changePercent: 0,
          rationale: 'No data for this placement.',
        }
        continue
      }

      const currentAdj = data.bidAdjustment
      let suggestedAdj = currentAdj
      let placeRationale = ''

      if (data.sales > 0 && data.totalCost > 0) {
        const placeRoas = data.sales / data.totalCost
        const placeAcos = (data.totalCost / data.sales) * 100

        if (placeRoas > avgRoas * 1.1) {
          placeRationale = `Strong ROAS (${placeRoas.toFixed(2)}) vs avg. Amplify this placement.`
          const increase = Math.min(MAX_PLACEMENT_CHANGE_PCT / 100, 0.25)
          suggestedAdj = Math.min(currentAdj + increase * 100, currentAdj + 25)
        } else if (placeAcos > targetAcosPct * 1.3) {
          placeRationale = `Placement ACoS ${placeAcos.toFixed(1)}% exceeds target. Reduce exposure.`
          const decrease = Math.min(MAX_PLACEMENT_CHANGE_PCT / 100, 0.25)
          suggestedAdj = Math.max(currentAdj - decrease * 100, currentAdj - 25, -50)
        } else {
          placeRationale = 'Performance in line with target. Maintain current adjustment.'
        }
      } else if (data.clicks > 0 || data.totalCost > 0) {
        placeRationale = 'Limited conversion data. Maintain current adjustment.'
      }

      suggestedAdj = Math.round(suggestedAdj)
      suggestedAdj = Math.max(-50, Math.min(900, suggestedAdj))

      layer2Result[key] = {
        suggestedAdjustment: suggestedAdj,
        changePercent: currentAdj !== 0 ? ((suggestedAdj - currentAdj) / Math.abs(currentAdj)) * 100 : 0,
        rationale: placeRationale,
      }
    }
  } else if (placementData && status === 'unprofitable') {
    layer2Result.hasPlacementData = true
    layer2Result.topOfSearch.rationale = 'Fix base bid profitability first. Do not adjust placements yet.'
    layer2Result.restOfSearch.rationale = 'Fix base bid profitability first. Do not adjust placements yet.'
    layer2Result.productPages.rationale = 'Fix base bid profitability first. Do not adjust placements yet.'
  }

  return {
    layer1: {
      suggestedBaseBid,
      changePercent,
      status,
      rationale,
      economicMaxCpc,
      roas,
      cvr,
    },
    layer2: layer2Result,
  }
}
