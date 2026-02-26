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
  topOfSearchClicks?: number
  topOfSearchOrders?: number
  placementAwareEnabled?: boolean
}

export type ClassificationStatus = 'Profitable & Scalable' | 'Stable' | 'Weak' | 'Losing'
export type ConfidenceLevel = 'Low' | 'Medium' | 'High' | 'Full'

export interface AcosCalculatorResult {
  cvr: number
  maxCpcValue: number
  cpcAcosAdjusted: number
  suggestedCore: number
  suggestedBidFinal: number
  suggestedAfterConfidence: number
  capStatus: 'none' | 'decrease' | 'increase'
  status: ClassificationStatus
  placementAdvantage: boolean
  recommendedBaseAdjustment: string
  recommendedPlacementAction: string
  confidenceLevel: ConfidenceLevel
  /** Only when placement-aware enabled */
  blendedCvr?: number
  topCvr?: number
  adjustedCvr?: number
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
 * Get classification status from ACOS ratio.
 */
function getClassificationStatus(acosRatio: number): ClassificationStatus {
  if (acosRatio <= 0.7) return 'Profitable & Scalable'
  if (acosRatio <= 1.2) return 'Stable'
  if (acosRatio <= 2) return 'Weak'
  return 'Losing'
}

/**
 * Get confidence level from click volume.
 */
function getConfidenceLevel(clicks: number): ConfidenceLevel {
  if (clicks < 10) return 'Low'
  if (clicks < 30) return 'Medium'
  if (clicks < 60) return 'High'
  return 'Full'
}

/**
 * Get action engine recommendations from status and placement advantage.
 */
function getActionRecommendations(
  status: ClassificationStatus,
  placementAdvantage: boolean
): { recommendedBaseAdjustment: string; recommendedPlacementAction: string } {
  switch (status) {
    case 'Profitable & Scalable':
      return placementAdvantage
        ? { recommendedBaseAdjustment: '+15%', recommendedPlacementAction: 'Increase Top-of-Search multiplier' }
        : { recommendedBaseAdjustment: '+10%', recommendedPlacementAction: 'Monitor marginal ACOS' }
    case 'Stable':
      return placementAdvantage
        ? { recommendedBaseAdjustment: '±10% max', recommendedPlacementAction: 'Shift exposure toward Top-of-Search' }
        : { recommendedBaseAdjustment: '±10% max', recommendedPlacementAction: 'Maintain bid' }
    case 'Weak':
      return placementAdvantage
        ? { recommendedBaseAdjustment: '-15% to -30%', recommendedPlacementAction: 'Increase profitable placement exposure cautiously' }
        : { recommendedBaseAdjustment: '-30%', recommendedPlacementAction: 'Reduce base bid' }
    case 'Losing':
      return placementAdvantage
        ? { recommendedBaseAdjustment: '-30% to -40%', recommendedPlacementAction: 'Increase profitable placement multiplier, reduce base bid' }
        : { recommendedBaseAdjustment: '-40% to -60%', recommendedPlacementAction: 'Reduce bid significantly' }
    default:
      return { recommendedBaseAdjustment: '—', recommendedPlacementAction: '—' }
  }
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
  const placementAware = inputs.placementAwareEnabled === true

  // Cap baseline: CurrentBid if toggle on and valid, else CurrentCPC
  const useBid = inputs.useCurrentBidForCaps && Number.isFinite(inputs.currentBid) && (inputs.currentBid ?? 0) > 0
  const capBaseline = useBid ? (inputs.currentBid as number) : currentCpc

  // Step 1: Blended CVR (if Orders == 0, CVR = 0)
  const blendedCvr = clicks > 0 ? orders / clicks : 0

  // Placement-aware: compute AdjustedCVR when Top of Search converts better
  let cvr = blendedCvr
  let blendedCvrOut: number | undefined
  let topCvrOut: number | undefined
  let adjustedCvrOut: number | undefined

  let placementAdvantage = false
  if (placementAware) {
    blendedCvrOut = blendedCvr
    const topClicks = Number(inputs.topOfSearchClicks) || 0
    const topOrders = Number(inputs.topOfSearchOrders) || 0
    const topCvr = topClicks > 0 ? topOrders / topClicks : 0
    topCvrOut = topClicks > 0 ? topCvr : 0
    placementAdvantage = topCvr > blendedCvr && blendedCvr > 0

    if (placementAdvantage) {
      const cvrLift = Math.min(topCvr / blendedCvr, 2.0)
      cvr = blendedCvr * (0.5 + 0.5 * cvrLift)
      adjustedCvrOut = cvr
    } else {
      adjustedCvrOut = blendedCvr
    }
  }

  // Step 2: Value-based Max CPC (uses cvr = blended or adjusted)
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

  const status = getClassificationStatus(acosRatio)
  const confidenceLevel = getConfidenceLevel(clicks)
  const { recommendedBaseAdjustment, recommendedPlacementAction } = getActionRecommendations(status, placementAdvantage)

  return {
    cvr: round4(cvr),
    maxCpcValue: round2(maxCpcValue),
    cpcAcosAdjusted: round2(cpcAcosAdjusted),
    suggestedCore: round2(suggestedCore),
    suggestedBidFinal: round2(suggestedBidFinal),
    suggestedAfterConfidence: round2(suggestedAfterConfidence),
    capStatus,
    status,
    placementAdvantage,
    recommendedBaseAdjustment,
    recommendedPlacementAction,
    confidenceLevel,
    ...(placementAware && {
      blendedCvr: blendedCvrOut != null ? round4(blendedCvrOut) : undefined,
      topCvr: topCvrOut != null ? round4(topCvrOut) : undefined,
      adjustedCvr: adjustedCvrOut != null ? round4(adjustedCvrOut) : undefined,
    }),
  }
}
