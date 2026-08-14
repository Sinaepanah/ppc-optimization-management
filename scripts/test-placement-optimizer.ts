/**
 * Expert-alignment checks for Layer 2 placement optimizer.
 * Run twice: npx tsx scripts/test-placement-optimizer.ts
 */
import { optimize } from '../src/ppcTool/utils/optimizer.ts'
import type { ExtractedPlacementData } from '../src/ppcTool/utils/placementParser.ts'

const adLevel = {
  bid: '$0.88',
  impressions: '98438',
  clicks: '195',
  totalCost: '$157.95',
  cpc: '$0.81',
  purchases: '8',
  sales: '$285.62',
  acos: '55.3',
}

/** Real Amazon placement economics (spend derived from Sales×ACOS) */
const placement: ExtractedPlacementData = {
  topOfSearch: {
    placementName: 'Top of search (first page)',
    bidAdjustment: '120%',
    impressions: '1789',
    clicks: '32',
    ctr: '1.79%',
    totalCost: '$30.90',
    cpc: '$0.97',
    purchases: '3',
    sales: '$108.97',
    acos: '28.36',
  },
  restOfSearch: {
    placementName: 'Rest of search',
    bidAdjustment: '50%',
    impressions: '12847',
    clicks: '60',
    ctr: '0.47%',
    totalCost: '$50.36',
    cpc: '$0.84',
    purchases: '3',
    sales: '$104.42',
    acos: '48.23',
  },
  productPages: {
    placementName: 'Product pages',
    bidAdjustment: '0%',
    impressions: '83718',
    clicks: '103',
    ctr: '0.12%',
    totalCost: '$76.54',
    cpc: '$0.74',
    purchases: '2',
    sales: '$71.98',
    acos: '106.34',
  },
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

function runOnce(pass: number) {
  const r = optimize(adLevel, placement, 35)
  assert(!!r, 'optimize returned null')
  const { topOfSearch: tos, restOfSearch: rest, productPages: pp } = r!.layer2

  // Amazon floor: never negative
  assert(tos.suggestedAdjustment >= 0, `pass${pass} TOS negative`)
  assert(rest.suggestedAdjustment >= 0, `pass${pass} Rest negative`)
  assert(pp.suggestedAdjustment >= 0, `pass${pass} PP negative`)

  // TOS ~28% ACOS below 35% target → amplify, but small step (≤25 pts)
  assert(tos.suggestedAdjustment > 120, `pass${pass} TOS should amplify above 120, got ${tos.suggestedAdjustment}`)
  assert(tos.suggestedAdjustment - 120 <= 25, `pass${pass} TOS step too large: ${tos.suggestedAdjustment}`)

  // Rest ~48% above target → cut toward 0, not below
  assert(rest.suggestedAdjustment < 50, `pass${pass} Rest should cut below 50, got ${rest.suggestedAdjustment}`)
  assert(rest.suggestedAdjustment >= 0, `pass${pass} Rest below 0`)
  assert(50 - rest.suggestedAdjustment <= 25, `pass${pass} Rest cut too large`)

  // PP already 0% and terrible ACOS → stay at 0
  assert(pp.suggestedAdjustment === 0, `pass${pass} PP should stay 0, got ${pp.suggestedAdjustment}`)

  // Thin data: hold
  const thin = optimize(
    adLevel,
    {
      ...placement,
      topOfSearch: { ...placement.topOfSearch, clicks: '5', totalCost: '$5.00', sales: '$40.00', acos: '12.5' },
    },
    35
  )
  assert(thin!.layer2.topOfSearch.suggestedAdjustment === 120, `pass${pass} thin data should hold 120`)
  assert(
    /need ≥20|Maintain current/i.test(thin!.layer2.topOfSearch.rationale),
    `pass${pass} thin rationale`
  )

  // Never suggest negative even from high starting adj with huge ACOS
  const highAdj = optimize(
    adLevel,
    {
      ...placement,
      productPages: {
        ...placement.productPages,
        bidAdjustment: '10%',
        clicks: '50',
        totalCost: '$100',
        sales: '$50',
        acos: '200',
      },
    },
    35
  )
  assert(highAdj!.layer2.productPages.suggestedAdjustment >= 0, `pass${pass} cut must floor at 0`)
  assert(highAdj!.layer2.productPages.suggestedAdjustment < 10, `pass${pass} should cut PP`)

  console.log(`PASS_${pass}`, {
    tos: tos.suggestedAdjustment,
    rest: rest.suggestedAdjustment,
    pp: pp.suggestedAdjustment,
    tosR: tos.rationale.slice(0, 80),
    restR: rest.rationale.slice(0, 80),
    ppR: pp.rationale.slice(0, 80),
  })
}

runOnce(1)
runOnce(2)
console.log('ALL_PLACEMENT_EXPERT_CHECKS_OK')
