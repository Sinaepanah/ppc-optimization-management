/** Raw row from CSV or pasted data (column index → value) */
export type RawRow = Record<number, string>

/** Column mapping: logical field → column index (-1 = not mapped) */
export interface ColumnMapping {
  searchTerm: number
  spend: number
  sales: number
  orders: number
  clicks: number
  impressions: number
  cpc: number
  campaignName: number
  adGroupName: number
  matchType: number
  targeting: number
}

/** Parsed row with typed metrics (after mapping) */
export interface ParsedRow {
  searchTerm: string
  spend: number
  sales: number
  orders: number
  clicks: number | null
  impressions: number | null
  cpc: number | null
  campaignName: string | null
  adGroupName: string | null
  matchType: string | null
  targeting: string | null
}

/** Aggregated by normalized term */
export interface AggregatedTerm {
  normalizedTerm: string
  originalTerm: string
  spendSum: number
  salesSum: number
  ordersSum: number
  clicksSum: number
  impressionsSum: number
  campaignName: string | null
  /** Number of CSV rows combined into this term (same normalized term) */
  rowCount: number
  /** Suggested CPC from CSV or Spend/Clicks (for Exact campaign) */
  suggestedCpc: number | null
  /** Match type that contributed most spend (auto, broad, phrase) for performance comparison label */
  primaryMatchType: string | null
}

/** Promotion criteria (thresholds) */
export interface PromotionCriteria {
  minOrders: number
  minSales: number
  maxACoS: number
  minClicksEnabled: boolean
  minClicks: number
  minCVREnabled: boolean
  minCVR: number
  excludeBranded: boolean
  brandTokens: string[]
  excludeIrrelevant: boolean
  irrelevantProfileId: string | null
  irrelevantTokenList: string[]
}

/** Scored term for Promote to Exact */
export interface ScoredTerm extends AggregatedTerm {
  acosPct: number
  cvrPct: number | null
  confidence: number
  qualifies: boolean
  inReviewQueue: boolean
}

/** Default column mapping: required fields at -1 until user maps */
export const DEFAULT_COLUMN_MAPPING: ColumnMapping = {
  searchTerm: 0,
  spend: -1,
  sales: -1,
  orders: -1,
  clicks: -1,
  impressions: -1,
  cpc: -1,
  campaignName: -1,
  adGroupName: -1,
  matchType: -1,
  targeting: -1,
}

export const DEFAULT_CRITERIA: PromotionCriteria = {
  minOrders: 1,
  minSales: 10,
  maxACoS: 200,
  minClicksEnabled: false,
  minClicks: 20,
  minCVREnabled: false,
  minCVR: 8,
  excludeBranded: false,
  brandTokens: [],
  excludeIrrelevant: false,
  irrelevantProfileId: null,
  irrelevantTokenList: [],
}
