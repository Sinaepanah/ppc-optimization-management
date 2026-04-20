import type { Campaign, DuplicateResult } from '../types'
import { normalize } from './normalize'
import {
  detectDelimiter,
  detectAttributedSalesColumn,
  detectClicksColumn,
  detectPurchasesColumn,
  detectSpendColumn,
  findSearchTermReportHeaderRow,
  getCsvCell,
  inferClicksColumnFromSample,
  normalizeHeaderCell,
  parseDelimitedText,
  parseCsvNumber,
} from './csv'

function acosPctFromSpendAndSales(spend: number, sales: number): number | null {
  if (!(sales > 0) || !Number.isFinite(spend)) return null
  return (spend / sales) * 100
}

export function findCrossCampaignDuplicates(
  campaigns: Campaign[],
  minCampaigns: number = 2
): DuplicateResult[] {
  /** normalized term → campaign name → clicks for that term in that campaign */
  const normalizedToCampaignClicks = new Map<string, Map<string, number>>()
  const normalizedToCampaignPurchases = new Map<string, Map<string, number>>()
  const normalizedToCampaignSpend = new Map<string, Map<string, number>>()
  const normalizedToCampaignAttributedSales = new Map<string, Map<string, number>>()

  for (const camp of campaigns) {
    for (const norm of camp.normalizedToOriginal.keys()) {
      if (!normalizedToCampaignClicks.has(norm)) {
        normalizedToCampaignClicks.set(norm, new Map())
      }
      const byCamp = normalizedToCampaignClicks.get(norm)!
      if (!byCamp.has(camp.name)) {
        const clicks = camp.normalizedToClicks?.get(norm) ?? 0
        byCamp.set(camp.name, clicks)
      }

      if (!normalizedToCampaignPurchases.has(norm)) {
        normalizedToCampaignPurchases.set(norm, new Map())
      }
      const byPurch = normalizedToCampaignPurchases.get(norm)!
      if (!byPurch.has(camp.name)) {
        const purchases = camp.normalizedToPurchases?.get(norm) ?? 0
        byPurch.set(camp.name, purchases)
      }

      if (!normalizedToCampaignSpend.has(norm)) {
        normalizedToCampaignSpend.set(norm, new Map())
      }
      const bySpend = normalizedToCampaignSpend.get(norm)!
      if (!bySpend.has(camp.name)) {
        bySpend.set(camp.name, camp.normalizedToSpend?.get(norm) ?? 0)
      }

      if (!normalizedToCampaignAttributedSales.has(norm)) {
        normalizedToCampaignAttributedSales.set(norm, new Map())
      }
      const byAS = normalizedToCampaignAttributedSales.get(norm)!
      if (!byAS.has(camp.name)) {
        byAS.set(camp.name, camp.normalizedToAttributedSales?.get(norm) ?? 0)
      }
    }
  }

  const results: DuplicateResult[] = []
  for (const [normalizedTerm, byCampaign] of normalizedToCampaignClicks) {
    const campaignNames = Array.from(byCampaign.keys())
    if (campaignNames.length >= minCampaigns) {
      const clicksByCampaign = new Map(byCampaign)
      let totalClicks = 0
      for (const v of clicksByCampaign.values()) totalClicks += v

      const purchMap = normalizedToCampaignPurchases.get(normalizedTerm) ?? new Map<string, number>()
      const purchasesByCampaign = new Map<string, number>()
      let totalPurchases = 0
      for (const name of campaignNames) {
        const p = purchMap.get(name) ?? 0
        purchasesByCampaign.set(name, p)
        totalPurchases += p
      }

      const spendMap = normalizedToCampaignSpend.get(normalizedTerm) ?? new Map<string, number>()
      const salesMap = normalizedToCampaignAttributedSales.get(normalizedTerm) ?? new Map<string, number>()
      const spendByCampaign = new Map<string, number>()
      const attributedSalesByCampaign = new Map<string, number>()
      const acosPctByCampaign = new Map<string, number | null>()
      let totalSpend = 0
      let totalAttributedSales = 0
      for (const name of campaignNames) {
        const sp = spendMap.get(name) ?? 0
        const rev = salesMap.get(name) ?? 0
        spendByCampaign.set(name, sp)
        attributedSalesByCampaign.set(name, rev)
        acosPctByCampaign.set(name, acosPctFromSpendAndSales(sp, rev))
        totalSpend += sp
        totalAttributedSales += rev
      }
      const totalAcosPct = acosPctFromSpendAndSales(totalSpend, totalAttributedSales)

      results.push({
        normalizedTerm,
        campaigns: campaignNames,
        campaignCount: campaignNames.length,
        clicksByCampaign,
        totalClicks,
        purchasesByCampaign,
        totalPurchases,
        spendByCampaign,
        attributedSalesByCampaign,
        acosPctByCampaign,
        totalAcosPct,
      })
    }
  }
  results.sort((a, b) => b.campaignCount - a.campaignCount)
  return results
}

/**
 * Same shape as cross-campaign dedup, but each "campaign" slot is a **batch**: all files with the same
 * `bundleName` are aggregated (sums for clicks, purchases, spend, sales; ACOS from batch totals).
 * Files without a bundle name are treated as their own batch (one CSV = one batch).
 */
export function findCrossBatchDuplicates(campaigns: Campaign[], minBatches: number = 2): DuplicateResult[] {
  const batchMap = new Map<string, { label: string; camps: Campaign[] }>()
  for (const c of campaigns) {
    const bn = c.bundleName?.trim()
    const key = bn || `__ungrouped:${c.id}`
    if (!batchMap.has(key)) {
      batchMap.set(key, { label: bn || c.name, camps: [] })
    }
    batchMap.get(key)!.camps.push(c)
  }

  const normToBatchKeys = new Map<string, Set<string>>()
  for (const [bKey, { camps }] of batchMap) {
    const normsInBatch = new Set<string>()
    for (const camp of camps) {
      for (const norm of camp.normalizedToOriginal.keys()) {
        normsInBatch.add(norm)
      }
    }
    for (const norm of normsInBatch) {
      if (!normToBatchKeys.has(norm)) normToBatchKeys.set(norm, new Set())
      normToBatchKeys.get(norm)!.add(bKey)
    }
  }

  function aggregateForBatch(bKey: string, norm: string): {
    clicks: number
    purchases: number
    spend: number
    attributedSales: number
  } {
    const { camps } = batchMap.get(bKey)!
    let clicks = 0
    let purchases = 0
    let spend = 0
    let attributedSales = 0
    for (const camp of camps) {
      clicks += camp.normalizedToClicks?.get(norm) ?? 0
      purchases += camp.normalizedToPurchases?.get(norm) ?? 0
      spend += camp.normalizedToSpend?.get(norm) ?? 0
      attributedSales += camp.normalizedToAttributedSales?.get(norm) ?? 0
    }
    return { clicks, purchases, spend, attributedSales }
  }

  function uniqueBatchLabels(batchKeyList: string[]): string[] {
    return batchKeyList.map((bk) => {
      const entry = batchMap.get(bk)!
      const base = entry.label
      const sameBase = batchKeyList.filter((x) => batchMap.get(x)!.label === base)
      if (sameBase.length > 1) {
        const id = entry.camps[0]?.id ?? bk
        return `${base} (${id.slice(-8)})`
      }
      return base
    })
  }

  const results: DuplicateResult[] = []
  for (const [normalizedTerm, batchKeys] of normToBatchKeys) {
    if (batchKeys.size < minBatches) continue

    const batchKeyList = Array.from(batchKeys).sort((a, b) => {
      const la = batchMap.get(a)!.label
      const lb = batchMap.get(b)!.label
      return la.localeCompare(lb, undefined, { sensitivity: 'base' }) || a.localeCompare(b)
    })
    const labels = uniqueBatchLabels(batchKeyList)

    const clicksByCampaign = new Map<string, number>()
    const purchasesByCampaign = new Map<string, number>()
    const spendByCampaign = new Map<string, number>()
    const attributedSalesByCampaign = new Map<string, number>()
    const acosPctByCampaign = new Map<string, number | null>()

    let totalClicks = 0
    let totalPurchases = 0
    let totalSpend = 0
    let totalAttributedSales = 0

    batchKeyList.forEach((bk, i) => {
      const label = labels[i]!
      const agg = aggregateForBatch(bk, normalizedTerm)
      clicksByCampaign.set(label, agg.clicks)
      purchasesByCampaign.set(label, agg.purchases)
      spendByCampaign.set(label, agg.spend)
      attributedSalesByCampaign.set(label, agg.attributedSales)
      acosPctByCampaign.set(label, acosPctFromSpendAndSales(agg.spend, agg.attributedSales))
      totalClicks += agg.clicks
      totalPurchases += agg.purchases
      totalSpend += agg.spend
      totalAttributedSales += agg.attributedSales
    })

    const totalAcosPct = acosPctFromSpendAndSales(totalSpend, totalAttributedSales)

    results.push({
      normalizedTerm,
      campaigns: labels,
      campaignCount: labels.length,
      clicksByCampaign,
      totalClicks,
      purchasesByCampaign,
      totalPurchases,
      spendByCampaign,
      attributedSalesByCampaign,
      acosPctByCampaign,
      totalAcosPct,
    })
  }

  results.sort((a, b) => b.campaignCount - a.campaignCount)
  return results
}

/** Build campaign term maps from raw term list (no CSV clicks). */
export function buildCampaignFromTerms(rawTerms: string[]): Omit<Campaign, 'id' | 'name'> {
  const normalizedToOriginal = new Map<string, string>()
  for (const raw of rawTerms) {
    const n = normalize(raw)
    if (n != null && !normalizedToOriginal.has(n)) {
      normalizedToOriginal.set(n, raw)
    }
  }
  const normalizedToClicks = new Map<string, number>()
  const normalizedToPurchases = new Map<string, number>()
  const normalizedToSpend = new Map<string, number>()
  const normalizedToAttributedSales = new Map<string, number>()
  for (const k of normalizedToOriginal.keys()) {
    normalizedToClicks.set(k, 0)
    normalizedToPurchases.set(k, 0)
    normalizedToSpend.set(k, 0)
    normalizedToAttributedSales.set(k, 0)
  }
  return {
    terms: Array.from(normalizedToOriginal.keys()),
    normalizedToOriginal,
    normalizedToClicks,
    normalizedToPurchases,
    normalizedToSpend,
    normalizedToAttributedSales,
  }
}

/**
 * Parse CSV rows: unique terms by normalization, summed clicks per normalized term from a "Clicks" column when present.
 */
export function buildCampaignFromSearchTermRows(
  rows: string[][],
  termCol: number
): Omit<Campaign, 'id' | 'name'> {
  if (rows.length < 2) {
    return {
      terms: [],
      normalizedToOriginal: new Map(),
      normalizedToClicks: new Map(),
      normalizedToPurchases: new Map(),
      normalizedToSpend: new Map(),
      normalizedToAttributedSales: new Map(),
    }
  }
  const headerRow = findSearchTermReportHeaderRow(rows)
  const headers = rows[headerRow] ?? []
  const width = headers.length
  const sampleRows = rows.slice(headerRow + 1, headerRow + 220)

  let clicksCol = detectClicksColumn(headers)
  if (clicksCol < 0) {
    clicksCol = inferClicksColumnFromSample(headers, sampleRows, termCol, width)
  } else if (sampleRows.length > 4) {
    let sampleSum = 0
    for (const row of sampleRows) {
      if (!row?.length) continue
      const pad = row.length < width ? [...row, ...Array(width - row.length).fill('')] : row
      sampleSum += parseCsvNumber(getCsvCell(pad, clicksCol))
    }
    if (sampleSum === 0) {
      const alt = inferClicksColumnFromSample(headers, sampleRows, termCol, width)
      if (alt >= 0 && alt !== clicksCol) {
        let altSum = 0
        for (const row of sampleRows) {
          if (!row?.length) continue
          const pad = row.length < width ? [...row, ...Array(width - row.length).fill('')] : row
          altSum += parseCsvNumber(getCsvCell(pad, alt))
        }
        if (altSum > 0) clicksCol = alt
      }
    }
  }

  const purchasesCol = detectPurchasesColumn(headers)
  const spendCol = detectSpendColumn(headers)
  const attributedSalesCol = detectAttributedSalesColumn(headers)

  const normalizedToOriginal = new Map<string, string>()
  const normalizedToClicks = new Map<string, number>()
  const normalizedToPurchases = new Map<string, number>()
  const normalizedToSpend = new Map<string, number>()
  const normalizedToAttributedSales = new Map<string, number>()

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row?.length) continue
    const padded = row.length < width ? [...row, ...Array(width - row.length).fill('')] : row

    const rawTerm = getCsvCell(padded, termCol).trim()
    const n = normalize(rawTerm)
    if (!n) continue

    const clicks = clicksCol >= 0 ? parseCsvNumber(getCsvCell(padded, clicksCol)) : 0
    const purchases = purchasesCol >= 0 ? parseCsvNumber(getCsvCell(padded, purchasesCol)) : 0
    const spend = spendCol >= 0 ? parseCsvNumber(getCsvCell(padded, spendCol)) : 0
    const attrSales = attributedSalesCol >= 0 ? parseCsvNumber(getCsvCell(padded, attributedSalesCol)) : 0

    if (!normalizedToOriginal.has(n)) {
      normalizedToOriginal.set(n, rawTerm)
    }
    normalizedToClicks.set(n, (normalizedToClicks.get(n) ?? 0) + clicks)
    normalizedToPurchases.set(n, (normalizedToPurchases.get(n) ?? 0) + purchases)
    normalizedToSpend.set(n, (normalizedToSpend.get(n) ?? 0) + spend)
    normalizedToAttributedSales.set(n, (normalizedToAttributedSales.get(n) ?? 0) + attrSales)
  }

  return {
    terms: Array.from(normalizedToOriginal.keys()),
    normalizedToOriginal,
    normalizedToClicks,
    normalizedToPurchases,
    normalizedToSpend,
    normalizedToAttributedSales,
  }
}

function detectCampaignColumn(headers: string[]): number {
  const cells = headers.map((h) => normalizeHeaderCell(h))
  for (let i = 0; i < cells.length; i++) {
    const h = cells[i]
    if (h === 'campaign name' || h === 'campaign') return i
  }
  for (let i = 0; i < cells.length; i++) {
    const h = cells[i]
    if (!h.includes('campaign')) continue
    if (/id|status|type|budget|state|start|end|date|placement|portfolio|target|match/.test(h)) continue
    return i
  }
  return -1
}

function detectImpressionsColumn(headers: string[]): number {
  const cells = headers.map((h) => normalizeHeaderCell(h))
  for (let i = 0; i < cells.length; i++) {
    const h = cells[i]
    if (h === 'impressions' || h === 'impression') return i
  }
  for (let i = 0; i < cells.length; i++) {
    const h = cells[i]
    if (!/\bimpressions?\b/.test(h)) continue
    if (/share|rank|rate|market|viewable/.test(h)) continue
    return i
  }
  return -1
}

export interface SingleSheetDuplicateResult extends DuplicateResult {
  impressionsByCampaign: Map<string, number>
  totalImpressions: number
  totalSales: number
}

export function findSingleSheetDuplicatesByCampaign(
  text: string,
  minCampaigns = 2,
  minCombinedClicks = 0
): SingleSheetDuplicateResult[] {
  const sep = detectDelimiter(text)
  const rows = parseDelimitedText(text, sep)
  if (rows.length < 2) return []

  const headerRow = findSearchTermReportHeaderRow(rows)
  const headers = rows[headerRow] ?? []
  const width = headers.length
  const termCol = headers.findIndex((h) => {
    const n = normalizeHeaderCell(h)
    return (
      n === 'customer search term' ||
      n === 'search term' ||
      n === 'query' ||
      n === 'keyword' ||
      n === 'targeting' ||
      n.includes('customer search term')
    )
  })
  if (termCol < 0) return []

  const campaignCol = detectCampaignColumn(headers)
  if (campaignCol < 0) return []

  const sampleRows = rows.slice(headerRow + 1, headerRow + 220)
  let clicksCol = detectClicksColumn(headers)
  if (clicksCol < 0) clicksCol = inferClicksColumnFromSample(headers, sampleRows, termCol, width)
  const impressionsCol = detectImpressionsColumn(headers)

  const purchasesCol = detectPurchasesColumn(headers)
  const spendCol = detectSpendColumn(headers)
  const attributedSalesCol = detectAttributedSalesColumn(headers)

  type Metrics = { clicks: number; impressions: number; purchases: number; spend: number; attributedSales: number }
  const byTerm = new Map<string, Map<string, Metrics>>()

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row?.length) continue
    const padded = row.length < width ? [...row, ...Array(width - row.length).fill('')] : row

    const rawTerm = getCsvCell(padded, termCol).trim()
    const campaign = getCsvCell(padded, campaignCol).trim()
    const norm = normalize(rawTerm)
    if (!norm || !campaign) continue

    const clicks = clicksCol >= 0 ? parseCsvNumber(getCsvCell(padded, clicksCol)) : 0
    const impressions = impressionsCol >= 0 ? parseCsvNumber(getCsvCell(padded, impressionsCol)) : 0
    const purchases = purchasesCol >= 0 ? parseCsvNumber(getCsvCell(padded, purchasesCol)) : 0
    const spend = spendCol >= 0 ? parseCsvNumber(getCsvCell(padded, spendCol)) : 0
    const attrSales = attributedSalesCol >= 0 ? parseCsvNumber(getCsvCell(padded, attributedSalesCol)) : 0

    if (!byTerm.has(norm)) byTerm.set(norm, new Map())
    const byCampaign = byTerm.get(norm)!
    const prev = byCampaign.get(campaign) ?? { clicks: 0, impressions: 0, purchases: 0, spend: 0, attributedSales: 0 }
    byCampaign.set(campaign, {
      clicks: prev.clicks + clicks,
      impressions: prev.impressions + impressions,
      purchases: prev.purchases + purchases,
      spend: prev.spend + spend,
      attributedSales: prev.attributedSales + attrSales,
    })
  }

  const results: SingleSheetDuplicateResult[] = []
  for (const [normalizedTerm, metricsByCampaign] of byTerm) {
    const campaigns = Array.from(metricsByCampaign.keys()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    )
    if (campaigns.length < minCampaigns) continue

    const clicksByCampaign = new Map<string, number>()
    const impressionsByCampaign = new Map<string, number>()
    const purchasesByCampaign = new Map<string, number>()
    const spendByCampaign = new Map<string, number>()
    const attributedSalesByCampaign = new Map<string, number>()
    const acosPctByCampaign = new Map<string, number | null>()

    let totalClicks = 0
    let totalImpressions = 0
    let totalPurchases = 0
    let totalSpend = 0
    let totalAttributedSales = 0
    for (const campaign of campaigns) {
      const m = metricsByCampaign.get(campaign)!
      clicksByCampaign.set(campaign, m.clicks)
      impressionsByCampaign.set(campaign, m.impressions)
      purchasesByCampaign.set(campaign, m.purchases)
      spendByCampaign.set(campaign, m.spend)
      attributedSalesByCampaign.set(campaign, m.attributedSales)
      acosPctByCampaign.set(campaign, acosPctFromSpendAndSales(m.spend, m.attributedSales))
      totalClicks += m.clicks
      totalImpressions += m.impressions
      totalPurchases += m.purchases
      totalSpend += m.spend
      totalAttributedSales += m.attributedSales
    }
    if (totalClicks < minCombinedClicks) continue

    results.push({
      normalizedTerm,
      campaigns,
      campaignCount: campaigns.length,
      clicksByCampaign,
      impressionsByCampaign,
      totalClicks,
      totalImpressions,
      purchasesByCampaign,
      totalPurchases,
      spendByCampaign,
      attributedSalesByCampaign,
      acosPctByCampaign,
      totalSales: totalAttributedSales,
      totalAcosPct: acosPctFromSpendAndSales(totalSpend, totalAttributedSales),
    })
  }

  results.sort((a, b) => b.totalClicks - a.totalClicks || b.campaignCount - a.campaignCount)
  return results
}
