/**
 * ACOS Suggested Bid Calculator
 * Pure calculation logic — no UI.
 */

export interface AcosCalculatorInputs {
  clicks: number
  orders: number
  sellingPrice: number
  profitPerUnit: number
  targetAcosPct: number
}

export interface AcosCalculatorResult {
  cvr: number
  maxCpcAcos: number
  maxCpcProfit: number
  suggestedBid: number
  lowDataApplied: boolean
}

export interface AcosValidationError {
  field: string
  message: string
}

/**
 * Validates inputs. Returns array of errors (empty if valid).
 */
export function validateAcosInputs(inputs: AcosCalculatorInputs): AcosValidationError[] {
  const errors: AcosValidationError[] = []

  if (!Number.isFinite(inputs.clicks) || inputs.clicks <= 0) {
    errors.push({ field: 'clicks', message: 'Clicks must be greater than 0' })
  }
  if (!Number.isFinite(inputs.orders) || inputs.orders < 0) {
    errors.push({ field: 'orders', message: 'Orders must be 0 or greater' })
  }
  if (inputs.orders > inputs.clicks) {
    errors.push({ field: 'orders', message: 'Orders cannot exceed Clicks' })
  }
  if (!Number.isFinite(inputs.sellingPrice) || inputs.sellingPrice <= 0) {
    errors.push({ field: 'sellingPrice', message: 'Selling Price must be greater than 0' })
  }
  if (!Number.isFinite(inputs.profitPerUnit) || inputs.profitPerUnit <= 0) {
    errors.push({ field: 'profitPerUnit', message: 'Profit Per Unit must be greater than 0' })
  }
  if (!Number.isFinite(inputs.targetAcosPct) || inputs.targetAcosPct <= 0) {
    errors.push({ field: 'targetAcosPct', message: 'Target ACOS must be greater than 0' })
  }

  return errors
}

/**
 * Calculates suggested bid using ACOS and profit constraints.
 *
 * Step 1: CVR = Orders / Clicks
 * Step 2: MaxCPC_ACOS = (TargetACOS/100) × SellingPrice × CVR
 * Step 3: MaxCPC_Profit = ProfitPerUnit × CVR
 * Step 4: SuggestedBid = min(MaxCPC_ACOS, MaxCPC_Profit)
 * Step 5: If Clicks < 20: SuggestedBid *= 0.7 (low data protection)
 */
export function calculateSuggestedBid(inputs: AcosCalculatorInputs): AcosCalculatorResult | null {
  const errors = validateAcosInputs(inputs)
  if (errors.length > 0) return null

  const { clicks, orders, sellingPrice, profitPerUnit, targetAcosPct } = inputs

  // Step 1: CVR
  const cvr = orders / clicks

  // Step 2: MaxCPC_ACOS (TargetACOS as percentage, e.g. 35 → 0.35)
  const maxCpcAcos = (targetAcosPct / 100) * sellingPrice * cvr

  // Step 3: MaxCPC_Profit
  const maxCpcProfit = profitPerUnit * cvr

  // Step 4: Final = minimum of both
  let suggestedBid = Math.min(maxCpcAcos, maxCpcProfit)

  // Step 5: Low data protection
  const lowDataApplied = clicks < 20
  if (lowDataApplied) {
    suggestedBid *= 0.7
  }

  return {
    cvr: Math.round(cvr * 10000) / 10000, // 4 decimal places for display
    maxCpcAcos: Math.round(maxCpcAcos * 100) / 100,
    maxCpcProfit: Math.round(maxCpcProfit * 100) / 100,
    suggestedBid: Math.round(suggestedBid * 100) / 100,
    lowDataApplied,
  }
}
