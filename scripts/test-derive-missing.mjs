import {
  deriveMissingAdLevel,
  deriveMissingPlacement,
  deriveMissingMetrics,
} from '../server/ppcVisionExtract.js'

// Case: Amazon placement screenshot with NO Total cost column — model wrongly copied CPC → totalCost
const bogusTos = deriveMissingMetrics(
  {
    bidAdjustment: '120%',
    impressions: '1,789',
    clicks: '32',
    ctr: '1.79%',
    totalCost: '$0.97', // bogus copy of CPC
    cpc: '$0.97',
    purchases: '3',
    sales: '$108.97',
    acos: '28.36',
  },
  { includeCtr: true }
)

const expectedTosFromAcos = (108.97 * 28.36) / 100
if (Math.abs(parseFloat(bogusTos.totalCost.replace('$', '')) - expectedTosFromAcos) > 0.02) {
  throw new Error(`TOS totalCost want ~${expectedTosFromAcos.toFixed(2)} got ${bogusTos.totalCost}`)
}
if (bogusTos.cpc !== '$0.97' || bogusTos.sales !== '$108.97' || bogusTos.acos !== '28.36') {
  throw new Error('overwrote good extracted fields')
}

const pl = deriveMissingPlacement({
  topOfSearch: {
    placementName: 'Top of search (first page)',
    bidAdjustment: '120%',
    impressions: '1,789',
    clicks: '32',
    ctr: '1.79%',
    totalCost: '$0.97',
    cpc: '$0.97',
    purchases: '3',
    sales: '$108.97',
    acos: '28.36',
  },
  restOfSearch: {
    placementName: 'Rest of search',
    bidAdjustment: '50%',
    impressions: '12,847',
    clicks: '60',
    ctr: '0.47%',
    totalCost: '$0.84',
    cpc: '$0.84',
    purchases: '3',
    sales: '$104.42',
    acos: '48.23',
  },
  productPages: {
    placementName: 'Product pages',
    bidAdjustment: '0%',
    impressions: '83,718',
    clicks: '103',
    ctr: '0.12%',
    totalCost: '$0.74',
    cpc: '$0.74',
    purchases: '2',
    sales: '$71.98',
    acos: '106.34',
  },
})

function money(s) {
  return parseFloat(String(s).replace(/[$,]/g, ''))
}

const checks = [
  ['top', pl.topOfSearch.totalCost, (108.97 * 28.36) / 100],
  ['rest', pl.restOfSearch.totalCost, (104.42 * 48.23) / 100],
  ['pp', pl.productPages.totalCost, (71.98 * 106.34) / 100],
]
for (const [name, got, want] of checks) {
  if (Math.abs(money(got) - want) > 0.05) {
    throw new Error(`${name} totalCost want ~${want.toFixed(2)} got ${got}`)
  }
}

// Still derive when truly blank
const blank = deriveMissingAdLevel({
  bid: '$1.25',
  impressions: '92,585',
  clicks: '81',
  totalCost: '',
  cpc: '$1.31',
  purchases: '8',
  sales: '',
  acos: '35.72',
})
if (blank.totalCost !== '$106.11') throw new Error(`blank total ${blank.totalCost}`)
if (blank.sales !== '$297.06') throw new Error(`blank sales ${blank.sales}`)

// Do not overwrite real spend that matches clicks×cpc (1 click edge: totalCost==cpc is OK)
const oneClick = deriveMissingMetrics({
  clicks: '1',
  totalCost: '$0.97',
  cpc: '$0.97',
  sales: '$10.00',
  acos: '9.7',
})
if (oneClick.totalCost !== '$0.97') throw new Error('1-click spend should keep $0.97')

console.log('UNIT_OK', {
  tos: pl.topOfSearch.totalCost,
  rest: pl.restOfSearch.totalCost,
  pp: pl.productPages.totalCost,
})
