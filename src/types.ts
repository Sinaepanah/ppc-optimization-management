export interface Campaign {
  id: string
  name: string
  terms: string[]
  normalizedToOriginal: Map<string, string>
  /** Total clicks per normalized term within this file (summed when the same term appears on multiple rows). From the CSV "Clicks" column when present; otherwise 0. */
  normalizedToClicks: Map<string, number>
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
}

export type RelevancyStatus = 'Flagged' | 'Kept'

export interface RelevancyResult {
  originalTerm: string
  normalizedTerm: string
  status: RelevancyStatus
  matchedAllowedTopics: string[]
  matchedExcludedTopics: string[]
  reason: string
}

export const LARGE_DATA_WARNING = 50000
