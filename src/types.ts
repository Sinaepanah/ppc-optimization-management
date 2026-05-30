export interface TermMatchMetrics {
  clicks: number
  purchases: number
  spend: number
  attributedSales: number
}

/** Which CSV column populated termMatchBreakdown (Keywords vs Product targets). */
export type MatchTargetKind = 'keywords' | 'product-targets' | 'targeting'

export interface Campaign {
  id: string
  name: string
  /** Set when multiple CSVs were uploaded in one batch with a label — groups campaigns for organization (e.g. Deduplication). */
  bundleName?: string
  terms: string[]
  normalizedToOriginal: Map<string, string>
  /** Total clicks per normalized term within this file (summed when the same term appears on multiple rows). From the CSV "Clicks" column when present; otherwise 0. */
  normalizedToClicks: Map<string, number>
  /** Total purchases (order count) per normalized term from CSV columns like Purchases / Orders / 7 Day Total Orders when present; otherwise 0. */
  normalizedToPurchases: Map<string, number>
  /** Sum of ad spend (currency) per normalized term when a Spend/Cost column is present; otherwise 0. */
  normalizedToSpend: Map<string, number>
  /** Sum of attributed sales revenue (currency) per normalized term when present; used with spend for ACOS. */
  normalizedToAttributedSales: Map<string, number>
  /** Per search term → matched keyword/target label → metrics. Used for within-file duplicate detection. */
  termMatchBreakdown?: Map<string, Map<string, TermMatchMetrics>>
  /** Source of termMatchBreakdown labels when built from CSV (Keywords vs Product targets). */
  matchTargetKind?: MatchTargetKind
}

export interface Topic {
  id: string
  name: string
  includePhrases: string[]
  excludePhrases: string[]
}

export type TopicGroup = 'allowed' | 'excluded'

export interface TopicProfile {
  id: string
  name: string
  allowedTopics: Topic[]
  excludedTopics: Topic[]
  minimumAllowedMatches: number
}

export interface DuplicateResult {
  normalizedTerm: string
  campaigns: string[]
  campaignCount: number
  /** Clicks for this term in each campaign (file) that contains it */
  clicksByCampaign: Map<string, number>
  /** Sum of clicks across those campaigns */
  totalClicks: number
  /** Purchase count for this term in each campaign (file) */
  purchasesByCampaign: Map<string, number>
  /** Sum of purchases across those campaigns */
  totalPurchases: number
  /** Ad spend per campaign (file) for this term */
  spendByCampaign: Map<string, number>
  /** Attributed sales (revenue) per campaign for this term */
  attributedSalesByCampaign: Map<string, number>
  /** ACOS % = spend/sales×100 when attributed sales are positive; null if denominator missing or zero */
  acosPctByCampaign: Map<string, number | null>
  /** Blended ACOS across selected campaigns when total attributed sales are positive */
  totalAcosPct: number | null
}

export type RelevancyStatus = 'Flagged' | 'Kept'

export interface RelevancyResult {
  originalTerm: string
  normalizedTerm: string
  status: RelevancyStatus
  matchedAllowedTopics: string[]
  matchedExcludedTopics: string[]
  /** Exact include-phrases from excluded topics that matched this keyword. */
  matchedExcludedIncludePhrases: string[]
  reason: string
}

export const LARGE_DATA_WARNING = 50000
