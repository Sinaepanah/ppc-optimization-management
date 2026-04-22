import type { ScoredTerm } from '../types'
import type { ReferenceExactMetrics } from './referenceExact'

/**
 * Compare source (Auto/Broad/Phrase) vs Reference Exact performance on Purchases, ACoS, and CVR.
 *
 * ACoS rule: only compare when BOTH sides have attributed sales. If Reference Exact has no sales,
 * stored acosPct is 0 as a placeholder — it must NOT be treated as "0% ACOS wins" vs a real source ACOS.
 * In that case the source wins the ACoS metric when it has sales (measurable efficiency vs none on Exact).
 */
export function getPerformanceLabel(
  source: ScoredTerm,
  exact: ReferenceExactMetrics,
  primaryMatchType: string | null
): string {
  let sourceWins = 0
  let exactWins = 0

  // Purchases: higher is better
  if (source.ordersSum > exact.orders) sourceWins++
  else if (exact.orders > source.ordersSum) exactWins++

  // ACoS: lower is better — only compare percentages when both have sales (valid ACOS)
  if (source.salesSum > 0 && exact.sales > 0) {
    if (source.acosPct < exact.acosPct) sourceWins++
    else if (exact.acosPct < source.acosPct) exactWins++
  } else if (source.salesSum > 0 && exact.sales <= 0) {
    sourceWins++
  } else if (source.salesSum <= 0 && exact.sales > 0) {
    exactWins++
  }

  // CVR: higher is better — only when both have clicks (valid CVR on both sides)
  if (source.clicksSum > 0 && exact.clicks > 0) {
    const sourceCvr = source.cvrPct ?? 0
    const exactCvr = exact.cvrPct ?? 0
    if (sourceCvr > exactCvr) sourceWins++
    else if (exactCvr > sourceCvr) exactWins++
  }

  if (sourceWins > exactWins) {
    const raw = (primaryMatchType || 'Source').trim()
    const matchLabel = raw === '-' ? 'Exact' : raw || 'Source'
    return `Better in ${matchLabel}`
  }
  if (exactWins > sourceWins) {
    return 'Better in Exact'
  }
  return 'Similar'
}
