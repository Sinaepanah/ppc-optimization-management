import { normalize } from '../../utils/normalize'
import type { AggregatedTerm, ColumnMapping } from '../types'
import { parseRow, rowToRaw } from './csvHelpers'
import { normalizeCampaignNameForMatch } from './referenceExact'

/** How to combine rows that share the same normalized search term. */
export type SearchTermAggregateScope = 'across_campaigns' | 'within_campaign'

const BUCKET_SEP = '\u0001' as const

/** Normalize match type for display (auto, broad, phrase) */
function normalizeMatchType(mt: string | null): string | null {
  if (!mt || typeof mt !== 'string') return null
  const s = mt.trim().toLowerCase()
  if (s.includes('auto')) return 'Auto'
  if (s.includes('broad')) return 'Broad'
  if (s.includes('phrase')) return 'Phrase'
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : null
}

function aggregateBucketKey(
  norm: string,
  scope: SearchTermAggregateScope,
  mapping: ColumnMapping,
  parsedCampaignName: string | null
): string {
  if (scope !== 'within_campaign') return norm
  const cn =
    mapping.campaignName >= 0 && parsedCampaignName
      ? normalizeCampaignNameForMatch(parsedCampaignName)
      : ''
  return `${norm}${BUCKET_SEP}${cn || '__none__'}`
}

export function aggregateByNormalizedTerm(
  rows: string[][],
  mapping: ColumnMapping,
  skipHeaderRow: boolean = true,
  scope: SearchTermAggregateScope = 'across_campaigns'
): AggregatedTerm[] {
  const start = skipHeaderRow ? 1 : 0
  const map = new Map<string, AggregatedTerm>()
  const spendByMatchType = new Map<string, Map<string, number>>()
  const campaignsByTerm = new Map<string, Set<string>>()
  const roasNumByTerm = new Map<string, number>()
  const roasDenByTerm = new Map<string, number>()

  for (let i = start; i < rows.length; i++) {
    const raw = rowToRaw(rows[i])
    const parsed = parseRow(raw, mapping)
    if (!parsed) continue

    const norm = normalize(parsed.searchTerm)
    if (!norm) continue

    const bucketKey = aggregateBucketKey(norm, scope, mapping, parsed.campaignName)

    const suggestedCpc =
      parsed.cpc != null && parsed.cpc > 0
        ? parsed.cpc
        : (parsed.clicks ?? 0) > 0
          ? parsed.spend / (parsed.clicks ?? 1)
          : null
    const campaignName = parsed.campaignName ?? null
    const matchType = normalizeMatchType(parsed.matchType)

    if (!spendByMatchType.has(bucketKey)) spendByMatchType.set(bucketKey, new Map())
    const mtMap = spendByMatchType.get(bucketKey)!
    const key = matchType ?? '_unknown'
    mtMap.set(key, (mtMap.get(key) ?? 0) + parsed.spend)
    if (!campaignsByTerm.has(bucketKey)) campaignsByTerm.set(bucketKey, new Set<string>())
    if (campaignName) campaignsByTerm.get(bucketKey)!.add(campaignName)

    const existing = map.get(bucketKey)
    if (parsed.roas != null && parsed.spend > 0) {
      roasNumByTerm.set(bucketKey, (roasNumByTerm.get(bucketKey) ?? 0) + parsed.roas * parsed.spend)
      roasDenByTerm.set(bucketKey, (roasDenByTerm.get(bucketKey) ?? 0) + parsed.spend)
    }
    if (existing) {
      existing.spendSum += parsed.spend
      existing.salesSum += parsed.sales
      existing.ordersSum += parsed.orders
      existing.clicksSum += parsed.clicks ?? 0
      existing.impressionsSum += parsed.impressions ?? 0
      existing.rowCount += 1
      existing.suggestedCpc = existing.clicksSum > 0 ? existing.spendSum / existing.clicksSum : null
    } else {
      map.set(bucketKey, {
        normalizedTerm: norm,
        originalTerm: parsed.searchTerm,
        spendSum: parsed.spend,
        salesSum: parsed.sales,
        ordersSum: parsed.orders,
        clicksSum: parsed.clicks ?? 0,
        impressionsSum: parsed.impressions ?? 0,
        campaignName,
        campaignNames: campaignName ? [campaignName] : [],
        rowCount: 1,
        suggestedCpc,
        primaryMatchType: matchType,
        roas: null,
      })
    }
  }

  return Array.from(map.entries()).map(([bucketKey, agg]) => {
    const mtMap = spendByMatchType.get(bucketKey)
    if (mtMap && mtMap.size > 0) {
      let maxSpend = 0
      let best: string | null = null
      for (const [k, v] of mtMap) {
        if (k !== '_unknown' && v > maxSpend) {
          maxSpend = v
          best = k
        }
      }
      agg.primaryMatchType = best ?? agg.primaryMatchType ?? null
    }
    agg.campaignNames = Array.from(campaignsByTerm.get(bucketKey) ?? [])
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    if (!agg.campaignName && agg.campaignNames.length > 0) agg.campaignName = agg.campaignNames[0] ?? null
    const rd = roasDenByTerm.get(bucketKey) ?? 0
    const rn = roasNumByTerm.get(bucketKey) ?? 0
    agg.roas = rd > 0 ? rn / rd : null
    return agg
  })
}

/** One result per CSV row (no aggregation). Use when you want to see each row as in the file. */
export function oneRowPerCsvRow(
  rows: string[][],
  mapping: ColumnMapping,
  skipHeaderRow: boolean = true
): AggregatedTerm[] {
  const start = skipHeaderRow ? 1 : 0
  const result: AggregatedTerm[] = []
  for (let i = start; i < rows.length; i++) {
    const raw = rowToRaw(rows[i])
    const parsed = parseRow(raw, mapping)
    if (!parsed) continue
    const norm = normalize(parsed.searchTerm)
    if (!norm) continue
    const suggestedCpc =
      parsed.cpc != null && parsed.cpc > 0
        ? parsed.cpc
        : (parsed.clicks ?? 0) > 0
          ? parsed.spend / (parsed.clicks ?? 1)
          : null
    result.push({
      normalizedTerm: norm,
      originalTerm: parsed.searchTerm,
      spendSum: parsed.spend,
      salesSum: parsed.sales,
      ordersSum: parsed.orders,
      clicksSum: parsed.clicks ?? 0,
      impressionsSum: parsed.impressions ?? 0,
      campaignName: parsed.campaignName ?? null,
      campaignNames: parsed.campaignName ? [parsed.campaignName] : [],
      rowCount: 1,
      suggestedCpc,
      primaryMatchType: normalizeMatchType(parsed.matchType),
      roas: parsed.roas,
    })
  }
  return result
}
