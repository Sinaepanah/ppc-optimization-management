import type { Campaign, DuplicateResult } from '../types'
import { normalize } from './normalize'
import { detectClicksColumn, findSearchTermReportHeaderRow, parseCsvNumber } from './csv'

export function findCrossCampaignDuplicates(
  campaigns: Campaign[],
  minCampaigns: number = 2
): DuplicateResult[] {
  /** normalized term → campaign name → clicks for that term in that campaign */
  const normalizedToCampaignClicks = new Map<string, Map<string, number>>()

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
    }
  }

  const results: DuplicateResult[] = []
  for (const [normalizedTerm, byCampaign] of normalizedToCampaignClicks) {
    const campaignNames = Array.from(byCampaign.keys())
    if (campaignNames.length >= minCampaigns) {
      const clicksByCampaign = new Map(byCampaign)
      let totalClicks = 0
      for (const v of clicksByCampaign.values()) totalClicks += v
      results.push({
        normalizedTerm,
        campaigns: campaignNames,
        campaignCount: campaignNames.length,
        clicksByCampaign,
        totalClicks,
      })
    }
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
  for (const k of normalizedToOriginal.keys()) normalizedToClicks.set(k, 0)
  return {
    terms: Array.from(normalizedToOriginal.keys()),
    normalizedToOriginal,
    normalizedToClicks,
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
    return { terms: [], normalizedToOriginal: new Map(), normalizedToClicks: new Map() }
  }
  const headerRow = findSearchTermReportHeaderRow(rows)
  const headers = rows[headerRow] ?? []
  const clicksCol = detectClicksColumn(headers)
  const normalizedToOriginal = new Map<string, string>()
  const normalizedToClicks = new Map<string, number>()

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row?.length) continue
    const safeTermCol = Math.min(termCol, Math.max(0, row.length - 1))
    const rawTerm = row[safeTermCol]?.trim() ?? ''
    const n = normalize(rawTerm)
    if (!n) continue

    let clicks = 0
    if (clicksCol >= 0) {
      const safeClickCol = Math.min(clicksCol, Math.max(0, row.length - 1))
      clicks = parseCsvNumber(row[safeClickCol])
    }

    if (!normalizedToOriginal.has(n)) {
      normalizedToOriginal.set(n, rawTerm)
    }
    normalizedToClicks.set(n, (normalizedToClicks.get(n) ?? 0) + clicks)
  }

  return {
    terms: Array.from(normalizedToOriginal.keys()),
    normalizedToOriginal,
    normalizedToClicks,
  }
}
