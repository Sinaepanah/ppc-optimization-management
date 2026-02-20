export interface Campaign {
  id: string
  name: string
  terms: string[]
  normalizedToOriginal: Map<string, string>
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
  exampleByCampaign: Map<string, string>
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
