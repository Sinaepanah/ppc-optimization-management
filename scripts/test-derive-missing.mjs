import {
  deriveMissingAdLevel,
  deriveMissingPlacement,
} from '../server/ppcVisionExtract.js'

const ad = deriveMissingAdLevel({
  bid: '$1.25',
  impressions: '92,585',
  clicks: '81',
  totalCost: '',
  cpc: '$1.31',
  purchases: '8',
  sales: '',
  acos: '35.72',
})

if (ad.totalCost !== '$106.11') throw new Error(`totalCost want $106.11 got ${ad.totalCost}`)
if (ad.sales !== '$297.06') throw new Error(`sales want $297.06 got ${ad.sales}`)
if (ad.bid !== '$1.25' || ad.cpc !== '$1.31' || ad.acos !== '35.72') {
  throw new Error('overwrote extracted fields')
}

const keep = deriveMissingAdLevel({
  bid: '$1.00',
  impressions: '10',
  clicks: '2',
  totalCost: '$9.99',
  cpc: '$1.31',
  purchases: '1',
  sales: '$50.00',
  acos: '20',
})
if (keep.totalCost !== '$9.99' || keep.sales !== '$50.00') {
  throw new Error('overwrote present totalCost/sales')
}

const pl = deriveMissingPlacement({
  topOfSearch: {
    placementName: 'Top of search (first page)',
    bidAdjustment: '0%',
    impressions: '',
    clicks: '',
    ctr: '',
    totalCost: '',
    cpc: '',
    purchases: '',
    sales: '',
    acos: '',
  },
  restOfSearch: {
    placementName: 'Rest of search',
    bidAdjustment: '0%',
    impressions: '650',
    clicks: '2',
    ctr: '',
    totalCost: '',
    cpc: '$1.78',
    purchases: '0',
    sales: '',
    acos: '',
  },
  productPages: {
    placementName: 'Product pages',
    bidAdjustment: '0%',
    impressions: '1000',
    clicks: '10',
    ctr: '1%',
    totalCost: '',
    cpc: '$2.00',
    purchases: '1',
    sales: '',
    acos: '50',
  },
})

if (pl.restOfSearch.totalCost !== '$3.56') throw new Error(`rest totalCost ${pl.restOfSearch.totalCost}`)
if (pl.restOfSearch.ctr !== '0.31%') throw new Error(`rest ctr ${pl.restOfSearch.ctr}`)
if (pl.productPages.totalCost !== '$20.00') throw new Error(`pp total ${pl.productPages.totalCost}`)
if (pl.productPages.sales !== '$40.00') throw new Error(`pp sales ${pl.productPages.sales}`)
if (pl.productPages.ctr !== '1%') throw new Error('pp ctr overwritten')

console.log('UNIT_OK', { adTotal: ad.totalCost, adSales: ad.sales })
