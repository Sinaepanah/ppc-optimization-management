/**
 * SQP Column Mapping
 * Amazon SQP ASIN View Simple - exact header names. No fallbacks that could mix columns.
 */

export const QUERY_HEADER = 'Search Query'
export const VOLUME_HEADER = 'Search Query Volume'

export const IMPRESSIONS_TOTAL_HEADER = 'Impressions: Total Count'
export const IMPRESSIONS_ASIN_HEADER = 'Impressions: ASIN Count'
export const IMPRESSIONS_SHARE_HEADER = 'Impressions: ASIN Share %'

export const CLICKS_TOTAL_HEADER = 'Clicks: Total Count'
export const CLICKS_ASIN_HEADER = 'Clicks: ASIN Count'
export const CLICKS_SHARE_HEADER = 'Clicks: ASIN Share %'
export const CTR_HEADER = 'Clicks: Click Rate %'

export const CART_ADDS_TOTAL_HEADER = 'Cart Adds: Total Count'
export const CART_ADDS_ASIN_HEADER = 'Cart Adds: ASIN Count'
export const CART_ADDS_SHARE_HEADER = 'Cart Adds: ASIN Share %'
export const CART_ADD_RATE_HEADER = 'Cart Adds: Cart Add Rate %'

export const PURCHASES_TOTAL_HEADER = 'Purchases: Total Count'
export const PURCHASES_ASIN_HEADER = 'Purchases: ASIN Count'
export const PURCHASES_SHARE_HEADER = 'Purchases: ASIN Share %'
export const PURCHASE_RATE_HEADER = 'Purchases: Purchase Rate %'

export interface ColumnMapping {
  query: string | null
  searchVolume: string | null
  impressionsTotal: string | null
  impressionsASIN: string | null
  impressionsShare: string | null
  clicksTotal: string | null
  clicksASIN: string | null
  clickShare: string | null
  ctr: string | null
  cartAddsTotal: string | null
  cartAddsASIN: string | null
  cartAddShare: string | null
  cartAddRate: string | null
  purchasesTotal: string | null
  purchasesASIN: string | null
  purchaseShare: string | null
  purchaseRate: string | null
}

function findColumn(headers: string[], name: string): string | null {
  const normalized = (h: string) => (h || '').toLowerCase().trim()
  const target = normalized(name)
  for (let i = 0; i < headers.length; i++) {
    if (normalized(headers[i]) === target) return headers[i]
  }
  return null
}

/** Find "Impressions: ASIN Count" - exact match, then fallback: contains impressions+asin+count, excludes total/share/rate */
function findImpressionsASIN(headers: string[]): string | null {
  const exact = findColumn(headers, IMPRESSIONS_ASIN_HEADER)
  if (exact) return exact
  const lower = headers.map((h) => (h || '').toLowerCase().trim())
  for (let i = 0; i < lower.length; i++) {
    const h = lower[i]
    if (
      h.includes('impressions') &&
      h.includes('asin') &&
      h.includes('count') &&
      !h.includes('total') &&
      !h.includes('share') &&
      !h.includes('%')
    ) {
      return headers[i]
    }
  }
  return null
}

/** Find "Cart Adds: ASIN Count" - exact match, then fallback: contains cart+adds+asin+count, excludes total/share/rate */
function findCartAddsASIN(headers: string[]): string | null {
  const exact = findColumn(headers, CART_ADDS_ASIN_HEADER)
  if (exact) return exact
  const lower = headers.map((h) => (h || '').toLowerCase().trim())
  for (let i = 0; i < lower.length; i++) {
    const h = lower[i]
    if (
      (h.includes('cart') && h.includes('add')) &&
      h.includes('asin') &&
      h.includes('count') &&
      !h.includes('total') &&
      !h.includes('share') &&
      !h.includes('rate') &&
      !h.includes('%')
    ) {
      return headers[i]
    }
  }
  return null
}

export function buildColumnMapping(headers: string[]): ColumnMapping {
  return {
    query: findColumn(headers, QUERY_HEADER),
    searchVolume: findColumn(headers, VOLUME_HEADER),
    impressionsTotal: findColumn(headers, IMPRESSIONS_TOTAL_HEADER),
    impressionsASIN: findImpressionsASIN(headers),
    impressionsShare: findColumn(headers, IMPRESSIONS_SHARE_HEADER),
    clicksTotal: findColumn(headers, CLICKS_TOTAL_HEADER),
    clicksASIN: findColumn(headers, CLICKS_ASIN_HEADER),
    clickShare: findColumn(headers, CLICKS_SHARE_HEADER),
    ctr: findColumn(headers, CTR_HEADER),
    cartAddsTotal: findColumn(headers, CART_ADDS_TOTAL_HEADER),
    cartAddsASIN: findCartAddsASIN(headers),
    cartAddShare: findColumn(headers, CART_ADDS_SHARE_HEADER),
    cartAddRate: findColumn(headers, CART_ADD_RATE_HEADER),
    purchasesTotal: findColumn(headers, PURCHASES_TOTAL_HEADER),
    purchasesASIN: findColumn(headers, PURCHASES_ASIN_HEADER),
    purchaseShare: findColumn(headers, PURCHASES_SHARE_HEADER),
    purchaseRate: findColumn(headers, PURCHASE_RATE_HEADER),
  }
}

/** Returns warning if ASIN Count columns for impressions/cart adds are missing (used by new filters) */
export function getMappingAsinWarnings(mapping: ColumnMapping): string | null {
  const missing: string[] = []
  if (!mapping.impressionsASIN) missing.push('Impressions: ASIN Count')
  if (!mapping.cartAddsASIN) missing.push('Cart Adds: ASIN Count')
  if (missing.length === 0) return null
  return `Missing ASIN Count columns: ${missing.join(' and/or ')}. Min Impressions (ASIN) and Min Add to Cart (ASIN) filters will not work correctly.`
}

/** Pass if: query AND (purchasesASIN OR purchaseShare OR clicksASIN OR clickShare OR impressionsASIN OR impressionsShare) */
export function getMappingErrors(mapping: ColumnMapping): string[] {
  const errs: string[] = []
  if (!mapping.query) errs.push('Query column (Search Query)')
  const hasRequired =
    mapping.purchasesASIN ||
    mapping.purchaseShare ||
    mapping.clicksASIN ||
    mapping.clickShare ||
    mapping.impressionsASIN ||
    mapping.impressionsShare
  if (!hasRequired) {
    errs.push(
      'At least one of: Purchases ASIN, Purchase Share, Clicks ASIN, Click Share, Impressions ASIN, or Impression Share'
    )
  }
  return errs
}
