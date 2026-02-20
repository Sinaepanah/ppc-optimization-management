import { normalize } from '../../utils/normalize'
import type { AggregatedTerm, ColumnMapping } from '../types'
import { parseRow, rowToRaw } from './csvHelpers'

export function aggregateByNormalizedTerm(
  rows: string[][],
  mapping: ColumnMapping,
  skipHeaderRow: boolean = true
): AggregatedTerm[] {
  const start = skipHeaderRow ? 1 : 0
  const map = new Map<string, AggregatedTerm>()

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
    const existing = map.get(norm)
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
        rowCount: 1,
        suggestedCpc,
      })
    }
  }

  return Array.from(map.values())
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
      rowCount: 1,
      suggestedCpc,
    })
  }
  return result
}
