import type { Campaign, DuplicateResult } from '../types'
import { normalize } from './normalize'

export function findCrossCampaignDuplicates(
  campaigns: Campaign[],
  minCampaigns: number = 2
): DuplicateResult[] {
  const normalizedToCampaigns = new Map<string, Map<string, string>>()
  for (const camp of campaigns) {
    for (const [norm, example] of camp.normalizedToOriginal) {
      if (!normalizedToCampaigns.has(norm)) {
        normalizedToCampaigns.set(norm, new Map())
      }
      const byCamp = normalizedToCampaigns.get(norm)!
      if (!byCamp.has(camp.name)) {
        byCamp.set(camp.name, example)
      }
    }
  }
  const results: DuplicateResult[] = []
  for (const [normalizedTerm, byCampaign] of normalizedToCampaigns) {
    const campaignNames = Array.from(byCampaign.keys())
    if (campaignNames.length >= minCampaigns) {
      results.push({
        normalizedTerm,
        campaigns: campaignNames,
        campaignCount: campaignNames.length,
        exampleByCampaign: new Map(byCampaign),
      })
    }
  }
  results.sort((a, b) => b.campaignCount - a.campaignCount)
  return results
}

export function buildCampaignFromTerms(rawTerms: string[]): Campaign {
  const normalizedToOriginal = new Map<string, string>()
  for (const raw of rawTerms) {
    const n = normalize(raw)
    if (n != null && !normalizedToOriginal.has(n)) {
      normalizedToOriginal.set(n, raw)
    }
  }
  return {
    id: '',
    name: '',
    terms: Array.from(normalizedToOriginal.keys()),
    normalizedToOriginal,
  }
}
