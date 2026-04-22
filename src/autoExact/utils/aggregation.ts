import { normalize } from '../../utils/normalize'
import type { AggregatedTerm, ColumnMapping } from '../types'
import { parseRow, rowToRaw } from './csvHelpers'

/** Normalize match type for display (auto, broad, phrase) */
function normalizeMatchType(mt: string | null): string | null {
  if (!mt || typeof mt !== 'string') return null
  const s = mt.trim().toLowerCase()
  if (s.includes('auto')) return 'Auto'
  if (s.includes('broad')) return 'Broad'
  if (s.includes('phrase')) return 'Phrase'
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : null
}

export function aggregateByNormalizedTerm(
  rows: string[][],
  mapping: ColumnMapping,
  skipHeaderRow: boolean = true
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

    const suggestedCpc =
      parsed.cpc != null && parsed.cpc > 0
        ? parsed.cpc
        : (parsed.clicks ?? 0) > 0
          ? parsed.spend / (parsed.clicks ?? 1)
          : null
    const campaignName = parsed.campaignName ?? null
    const matchType = normalizeMatchType(parsed.matchType)

    if (!spendByMatchType.has(norm)) spendByMatchType.set(norm, new Map())
    const mtMap = spendByMatchType.get(norm)!
    const key = matchType ?? '_unknown'
    mtMap.set(key, (mtMap.get(key) ?? 0) + parsed.spend)
    if (!campaignsByTerm.has(norm)) campaignsByTerm.set(norm, new Set<string>())
    if (campaignName) campaignsByTerm.get(norm)!.add(campaignName)

    const existing = map.get(norm)
    if (parsed.roas != null && parsed.spend > 0) {
      roasNumByTerm.set(norm, (roasNumByTerm.get(norm) ?? 0) + parsed.roas * parsed.spend)
      roasDenByTerm.set(norm, (roasDenByTerm.get(norm) ?? 0) + parsed.spend)
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
      map.set(norm, {
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

  return Array.from(map.values()).map((agg) => {
    const mtMap = spendByMatchType.get(agg.normalizedTerm)
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
    agg.campaignNames = Array.from(campaignsByTerm.get(agg.normalizedTerm) ?? [])
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    if (!agg.campaignName && agg.campaignNames.length > 0) agg.campaignName = agg.campaignNames[0] ?? null
    const rd = roasDenByTerm.get(agg.normalizedTerm) ?? 0
    const rn = roasNumByTerm.get(agg.normalizedTerm) ?? 0
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
