/**
 * ACOS Suggested Bid Calculator
 * Pure calculation logic — no UI.
 */

export interface AcosCalculatorInputs {
  currentCpc: number
  currentAcos: number
  targetAcos: number
  clicks: number
  orders: number
  asp: number
  currentBid?: number
  useCurrentBidForCaps?: boolean
}

export interface AcosCalculatorResult {
  cvr: number
  maxCpcValue: number
  cpcAcosAdjusted: number
  suggestedCore: number
  suggestedBidFinal: number
  suggestedAfterConfidence: number
  capStatus: 'none' | 'decrease' | 'increase'
}

export interface AcosValidationError {
  field: string
  message: string
}

/**
 * Validates inputs. Returns array of errors (empty if valid).
 */
export function validateAcosInputs(inputs: Omit<AcosCalculatorInputs, 'currentBid' | 'useCurrentBidForCaps'>): AcosValidationError[] {
  const errors: AcosValidationError[] = []

  if (!Number.isFinite(inputs.currentCpc) || inputs.currentCpc <= 0) {
    errors.push({ field: 'currentCpc', message: 'Current CPC must be greater than 0' })
  }
  if (!Number.isFinite(inputs.currentAcos) || inputs.currentAcos <= 0) {
    errors.push({ field: 'currentAcos', message: 'Current ACOS must be greater than 0' })
  }
  if (!Number.isFinite(inputs.targetAcos) || inputs.targetAcos <= 0) {
    errors.push({ field: 'targetAcos', message: 'Target ACOS must be greater than 0' })
  }
  if (!Number.isFinite(inputs.clicks) || inputs.clicks <= 0) {
    errors.push({ field: 'clicks', message: 'Clicks must be greater than 0' })
  }
  if (!Number.isFinite(inputs.orders) || inputs.orders < 0) {
    errors.push({ field: 'orders', message: 'Orders must be 0 or greater' })
  }
  if (inputs.orders > inputs.clicks) {
    errors.push({ field: 'orders', message: 'Orders cannot exceed Clicks' })
  }
  if (!Number.isFinite(inputs.asp) || inputs.asp <= 0) {
    errors.push({ field: 'asp', message: 'Average Selling Price must be greater than 0' })
  }

  return errors
}

/**
 * Get MaxDecrease based on ACOS ratio (CurrentACOS / TargetACOS).
 */
function getMaxDecrease(acosRatio: number): number {
  if (acosRatio >= 5) return 0.6
  if (acosRatio >= 3) return 0.5
  if (acosRatio >= 2) return 0.4
  return 0.3
}

/**
 * Calculates suggested bid.
 *
 * Core:
 * 1) CVR = Orders / Clicks
 * 2) MaxCPC_Value = (TargetACOS/100) * ASP * CVR
 * 3) CPC_ACOS_Adjusted = CurrentCPC * (TargetACOS / CurrentACOS)
 * 4) SuggestedCore = min(MaxCPC_Value, CPC_ACOS_Adjusted)
 *
 * Guardrails:
 * 5) Confidence scaling: SuggestedAfterConfidence = CurrentCPC*(1-CF) + SuggestedCore*CF
 * 6) Dynamic caps: LowerBound = capBaseline*(1-MaxDecrease), UpperBound = capBaseline*1.25
 *    MaxDecrease from ACOSRatio; capBaseline = CurrentBid or CurrentCPC per toggle
 */
export function calculateSuggestedBid(inputs: AcosCalculatorInputs): AcosCalculatorResult | null {
  const baseInputs = {
    currentCpc: inputs.currentCpc,
    currentAcos: inputs.currentAcos,
    targetAcos: inputs.targetAcos,
    clicks: inputs.clicks,
    orders: inputs.orders,
    asp: inputs.asp,
  }
  const errors = validateAcosInputs(baseInputs)
  if (errors.length > 0) return null

  const { currentCpc, currentAcos, targetAcos, clicks, orders, asp } = inputs

  // Cap baseline: CurrentBid if toggle on and valid, else CurrentCPC
  const useBid = inputs.useCurrentBidForCaps && Number.isFinite(inputs.currentBid) && (inputs.currentBid ?? 0) > 0
  const capBaseline = useBid ? (inputs.currentBid as number) : currentCpc

  // Step 1: CVR (if Orders == 0, CVR = 0)
  const cvr = clicks > 0 ? orders / clicks : 0

  // Step 2: Value-based Max CPC
  const maxCpcValue = (targetAcos / 100) * asp * cvr

  // Step 3: ACOS-correction CPC
  const cpcAcosAdjusted = currentCpc * (targetAcos / currentAcos)

  // Step 4: SuggestedCore (uncapped math recommendation)
  const suggestedCore = Math.min(maxCpcValue, cpcAcosAdjusted)

  // Step 5: Progressive confidence scaling
  let confidenceFactor: number
  if (clicks < 10) confidenceFactor = 0.2
  else if (clicks < 30) confidenceFactor = 0.5
  else if (clicks < 60) confidenceFactor = 0.75
  else confidenceFactor = 1.0

  const suggestedAfterConfidence =
    currentCpc * (1 - confidenceFactor) + suggestedCore * confidenceFactor

  // Step 6: Dynamic caps based on ACOS ratio
  const acosRatio = targetAcos > 0 ? currentAcos / targetAcos : 1
  const maxDecrease = getMaxDecrease(acosRatio)
  const maxIncrease = 0.25
  const lowerBound = capBaseline * (1 - maxDecrease)
  const upperBound = capBaseline * (1 + maxIncrease)

  let suggestedBidFinal = suggestedAfterConfidence
  let capStatus: 'none' | 'decrease' | 'increase' = 'none'

  if (suggestedAfterConfidence < lowerBound) {
    suggestedBidFinal = lowerBound
    capStatus = 'decrease'
  } else if (suggestedAfterConfidence > upperBound) {
    suggestedBidFinal = upperBound
    capStatus = 'increase'
  }

  const round2 = (n: number) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : 0)
  const round4 = (n: number) => (Number.isFinite(n) ? Math.round(n * 10000) / 10000 : 0)

  return {
    cvr: round4(cvr),
    maxCpcValue: round2(maxCpcValue),
    cpcAcosAdjusted: round2(cpcAcosAdjusted),
    suggestedCore: round2(suggestedCore),
    suggestedBidFinal: round2(suggestedBidFinal),
    suggestedAfterConfidence: round2(suggestedAfterConfidence),
    capStatus,
  }
}
