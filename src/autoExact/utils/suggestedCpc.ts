/**
 * Suggested max CPC from target ACoS % and aggregated term metrics.
 *
 * Uses the common optimization framing: **Target ACoS × AOV × CVR**, where
 * AOV = sales ÷ orders and CVR = orders ÷ clicks.
 *
 * Algebraically equals **Target ACoS × sales ÷ clicks** when CVR ≤ 100%.
 * When **orders > clicks** (reporting / attribution), CVR is capped at **100%**
 * so implied CPC stays **Target ACoS × AOV** instead of using revenue-per-click
 * as if one click could convert multiple times in one auction.
 */
export function suggestedCpcFromTargetAcos(
  salesSum: number,
  ordersSum: number,
  clicksSum: number,
  targetAcosPct: number
): number | null {
  if (clicksSum <= 0 || targetAcosPct <= 0) return null
  if (ordersSum <= 0 || salesSum <= 0) return null
  const aov = salesSum / ordersSum
  const ordersPerClick = ordersSum / clicksSum
  const effectiveCvr = Math.min(ordersPerClick, 1)
  return (targetAcosPct / 100) * aov * effectiveCvr
}
