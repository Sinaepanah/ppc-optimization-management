import type { Topic, TopicProfile, RelevancyResult } from '../types'
import { normalize, phraseMatchesSmart } from './normalize'

function topicMatchesTerm(
  normalizedTerm: string,
  topic: Topic
): { include: boolean; includePhrase: string | null; exclude: boolean } {
  let include = false
  let includePhrase: string | null = null
  for (const p of topic.includePhrases) {
    const np = normalize(p)
    if (np && phraseMatchesSmart(normalizedTerm, np)) {
      include = true
      includePhrase = p
      break
    }
  }
  let exclude = false
  for (const p of topic.excludePhrases) {
    const np = normalize(p)
    if (np && phraseMatchesSmart(normalizedTerm, np)) {
      exclude = true
      break
    }
  }
  return { include, includePhrase, exclude }
}

export function runRelevancyFilter(
  campaignTerms: Array<{ original: string; normalized: string }>,
  profile: TopicProfile
): RelevancyResult[] {
  const results: RelevancyResult[] = []

  for (const { original, normalized } of campaignTerms) {
    const matchedAllowed: string[] = []
    const matchedExcluded: string[] = []
    const matchedExcludedIncludePhrases: string[] = []

    for (const topic of profile.allowedTopics) {
      const { include, exclude } = topicMatchesTerm(normalized, topic)
      if (include && !exclude) matchedAllowed.push(topic.name)
    }
    for (const topic of profile.excludedTopics) {
      const { include, includePhrase } = topicMatchesTerm(normalized, topic)
      if (include) {
        matchedExcluded.push(topic.name)
        if (includePhrase) matchedExcludedIncludePhrases.push(includePhrase)
      }
    }

    // Only negate when the term matches an EXCLUDED topic (e.g. drinking water, pool).
    // Do NOT flag for "no allowed topic match" — those terms stay in campaign.
    let status: RelevancyResult['status'] = 'Kept'
    let reason = ''

    if (matchedExcluded.length > 0) {
      status = 'Flagged'
      reason = `Matched excluded topic: ${matchedExcluded.join(', ')}`
    }

    results.push({
      originalTerm: original,
      normalizedTerm: normalized,
      status,
      matchedAllowedTopics: matchedAllowed,
      matchedExcludedTopics: matchedExcluded,
      matchedExcludedIncludePhrases: Array.from(new Set(matchedExcludedIncludePhrases)),
      reason: reason || '—',
    })
  }

  return results
}
