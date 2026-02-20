import type { Topic, TopicProfile, RelevancyResult } from '../types'
import { normalize, phraseMatchesSmart } from './normalize'

function topicMatchesTerm(
  normalizedTerm: string,
  topic: Topic
): { include: boolean; exclude: boolean } {
  let include = false
  for (const p of topic.includePhrases) {
    const np = normalize(p)
    if (np && phraseMatchesSmart(normalizedTerm, np)) {
      include = true
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
  return { include, exclude }
}

export function runRelevancyFilter(
  campaignTerms: Array<{ original: string; normalized: string }>,
  profile: TopicProfile
): RelevancyResult[] {
  const results: RelevancyResult[] = []

  for (const { original, normalized } of campaignTerms) {
    const matchedAllowed: string[] = []
    const matchedExcluded: string[] = []

    for (const topic of profile.allowedTopics) {
      const { include, exclude } = topicMatchesTerm(normalized, topic)
      if (include && !exclude) matchedAllowed.push(topic.name)
    }
    for (const topic of profile.excludedTopics) {
      const { include } = topicMatchesTerm(normalized, topic)
      if (include) matchedExcluded.push(topic.name)
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
      reason: reason || '—',
    })
  }

  return results
}
