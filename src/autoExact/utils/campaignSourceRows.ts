import type { Campaign } from '../../types'
import { getStoredCampaignSourceRows } from '../../utils/storage'

function reconstructCampaignSourceRows(campaign: Campaign): string[][] | null {
  if (campaign.terms.length === 0) return null
  const header = ['Customer Search Term', 'Clicks', 'Impressions', 'Spend', 'Sales', 'Orders', 'Campaign Name']
  const body: string[][] = []
  for (const [norm, original] of campaign.normalizedToOriginal) {
    body.push([
      original,
      String(campaign.normalizedToClicks?.get(norm) ?? 0),
      String(campaign.normalizedToImpressions?.get(norm) ?? 0),
      String(campaign.normalizedToSpend?.get(norm) ?? 0),
      String(campaign.normalizedToAttributedSales?.get(norm) ?? 0),
      String(campaign.normalizedToPurchases?.get(norm) ?? 0),
      campaign.name,
    ])
  }
  return [header, ...body]
}

/** Rows usable as Auto → Exact source data (stored upload, or rebuilt from campaign metrics). */
export function resolveCampaignSourceRows(campaign: Campaign): string[][] | null {
  if (campaign.sourceRows && campaign.sourceRows.length > 0) return campaign.sourceRows
  const stored = getStoredCampaignSourceRows(campaign.id)
  if (stored && stored.length > 0) return stored
  return reconstructCampaignSourceRows(campaign)
}

export function campaignHasSourceData(campaign: Campaign): boolean {
  return resolveCampaignSourceRows(campaign) != null
}
