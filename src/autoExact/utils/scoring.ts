import type { TopicProfile } from '../../types'
import { normalize, phraseMatchesSmart } from '../../utils/normalize'
import type { AggregatedTerm, PromotionCriteria, ScoredTerm } from '../types'

function termMatchesExcludedTopic(normalizedTerm: string, profile: TopicProfile): boolean {
  for (const topic of profile.excludedTopics) {
    for (const phrase of topic.includePhrases) {
      const np = normalize(phrase)
      if (np && phraseMatchesSmart(normalizedTerm, np)) return true
    }
  }
  return false
}

function termContainsBrandToken(normalizedTerm: string, tokens: string[]): boolean {
  const lower = normalizedTerm.toLowerCase()
  for (const t of tokens) {
    const tok = t.trim().toLowerCase()
    if (!tok) continue
    const np = normalize(tok)
    if (np && lower.includes(np)) return true
  }
  return false
}

function termMatchesExcludeList(normalizedTerm: string, tokenList: string[]): boolean {
  const lower = normalizedTerm.toLowerCase()
  for (const t of tokenList) {
    const tok = t.trim().toLowerCase()
    if (!tok) continue
    const np = normalize(tok)
    if (np && (lower.includes(np) || phraseMatchesSmart(normalizedTerm, np))) return true
  }
  return false
}

export function scoreTerm(
  agg: AggregatedTerm,
  criteria: PromotionCriteria,
  profiles: TopicProfile[]
): ScoredTerm {
  const acosPct = agg.salesSum > 0 ? (agg.spendSum / agg.salesSum) * 100 : 0
  const cvrPct = agg.clicksSum > 0 ? (agg.ordersSum / agg.clicksSum) * 100 : null

  let confidence = 0
  if (agg.ordersSum >= criteria.minOrders) confidence += 2
  if (agg.salesSum >= criteria.minSales) confidence += 2
  if (acosPct <= criteria.maxACoS && criteria.maxACoS > 0) confidence += 2
  if (criteria.minClicksEnabled && agg.clicksSum >= criteria.minClicks) confidence += 1
  if (criteria.minCVREnabled && cvrPct !== null && cvrPct >= criteria.minCVR) confidence += 1

  let qualifies =
    agg.ordersSum >= criteria.minOrders &&
    agg.salesSum >= criteria.minSales &&
    (criteria.maxACoS <= 0 || acosPct <= criteria.maxACoS) &&
    (!criteria.minClicksEnabled || agg.clicksSum >= criteria.minClicks) &&
    (!criteria.minCVREnabled || (cvrPct != null && cvrPct >= criteria.minCVR))
  if (criteria.excludeBranded && criteria.brandTokens.length > 0) {
    if (termContainsBrandToken(agg.normalizedTerm, criteria.brandTokens)) qualifies = false
  }
  if (criteria.excludeIrrelevant) {
    if (criteria.irrelevantProfileId) {
      const profile = profiles.find((p) => p.id === criteria.irrelevantProfileId)
      if (profile && termMatchesExcludedTopic(agg.normalizedTerm, profile)) qualifies = false
    } else if (criteria.irrelevantTokenList.length > 0) {
      if (termMatchesExcludeList(agg.normalizedTerm, criteria.irrelevantTokenList)) qualifies = false
    }
  }

  const acosWithin10 = criteria.maxACoS > 0 && acosPct <= criteria.maxACoS + 10 && acosPct > criteria.maxACoS
  const ordersMinusOne = agg.ordersSum === criteria.minOrders - 1 && agg.salesSum >= criteria.minSales * 0.5
  const inReviewQueue = !qualifies && (acosWithin10 || ordersMinusOne)

  return {
    ...agg,
    acosPct,
    cvrPct,
    confidence,
    qualifies,
    inReviewQueue,
  }
}

export function runScoring(
  aggregated: AggregatedTerm[],
  criteria: PromotionCriteria,
  profiles: TopicProfile[]
): ScoredTerm[] {
  return aggregated.map((agg) => scoreTerm(agg, criteria, profiles))
}

export function getPromoteList(scored: ScoredTerm[]): ScoredTerm[] {
  return scored.filter((s) => s.qualifies).sort((a, b) => b.confidence - a.confidence || b.salesSum - a.salesSum)
}

export function getReviewQueue(scored: ScoredTerm[]): ScoredTerm[] {
  return scored.filter((s) => s.inReviewQueue).sort((a, b) => b.salesSum - a.salesSum)
}
