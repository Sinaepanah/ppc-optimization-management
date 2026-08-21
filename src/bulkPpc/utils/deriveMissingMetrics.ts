/**
 * Same populate-or-derive rules as Exact Bid Tools screenshot extract:
 * fill ONLY blank metrics from Amazon identities; repair bogus spend≈CPC.
 */

export type DerivableKeywordMetrics = {
  impressions?: string
  clicks?: string
  spend?: string
  sales?: string
  acos?: string
  cpc?: string
  ctr?: string
  orders?: string
  cvr?: string
}

function asString(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}

function isBlank(v: unknown): boolean {
  const s = asString(v)
  return !s || /^[—\-–]+$/.test(s)
}

function parseMoney(v: unknown): number {
  if (isBlank(v)) return NaN
  const m = String(v).replace(/,/g, '').match(/(\d+(?:\.\d+)?)/)
  return m ? parseFloat(m[1]) : NaN
}

function parseCount(v: unknown): number {
  if (isBlank(v)) return NaN
  const m = String(v).replace(/,/g, '').match(/(\d+(?:\.\d+)?)/)
  return m ? parseFloat(m[1]) : NaN
}

/** ACOS as percent (handles 0.55 or 55). */
function parseAcosNum(v: unknown): number {
  if (isBlank(v)) return NaN
  const m = String(v).replace(/,/g, '').match(/(\d+(?:\.\d+)?)/)
  if (!m) return NaN
  let n = parseFloat(m[1])
  if (n > 0 && n < 10) n *= 100
  return n
}

function nearlyEqual(a: number, b: number, absTol = 0.02, relTol = 0.05): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  const diff = Math.abs(a - b)
  if (diff <= absTol) return true
  const scale = Math.max(Math.abs(a), Math.abs(b), 1e-9)
  return diff / scale <= relTol
}

function isBogusSpend(spend: number, cpc: number, clicks: number, sales: number, acos: number): boolean {
  if (!Number.isFinite(spend)) return true
  if (Number.isFinite(cpc) && Number.isFinite(clicks) && clicks > 1 && nearlyEqual(spend, cpc, 0.02, 0.02)) {
    return true
  }
  if (Number.isFinite(sales) && Number.isFinite(acos) && acos > 0 && sales >= 0) {
    const fromAcos = sales * (acos / 100)
    if (fromAcos >= 0.01 && !nearlyEqual(spend, fromAcos, 0.5, 0.25)) {
      if (Number.isFinite(clicks) && Number.isFinite(cpc) && clicks > 0) {
        const fromCpc = clicks * cpc
        if (nearlyEqual(fromAcos, fromCpc, 1.0, 0.15) && !nearlyEqual(spend, fromCpc, 0.5, 0.25)) {
          return true
        }
      }
      if (Number.isFinite(clicks) && clicks > 1 && Number.isFinite(cpc) && nearlyEqual(spend, cpc, 0.05, 0.05)) {
        return true
      }
    }
  }
  return false
}

/**
 * Fill blank KeywordRow metric fields. Never overwrites a real present value
 * unless spend is clearly a bogus CPC copy.
 */
export function deriveMissingKeywordMetrics<T extends DerivableKeywordMetrics>(row: T): T {
  const out: DerivableKeywordMetrics = { ...row }

  const clicks = parseCount(out.clicks)
  const impressions = parseCount(out.impressions)
  const orders = parseCount(out.orders)
  let spend = parseMoney(out.spend)
  let cpc = parseMoney(out.cpc)
  let sales = parseMoney(out.sales)
  let acos = parseAcosNum(out.acos)

  if (isBogusSpend(spend, cpc, clicks, sales, acos)) {
    out.spend = ''
    spend = NaN
  }

  // Prefer Sales × ACOS when Spend missing
  if (isBlank(out.spend) && Number.isFinite(sales) && Number.isFinite(acos) && acos > 0 && sales >= 0) {
    spend = sales * (acos / 100)
    out.spend = spend.toFixed(2)
  }
  if (isBlank(out.spend) && Number.isFinite(clicks) && Number.isFinite(cpc) && clicks >= 0 && cpc >= 0) {
    spend = clicks * cpc
    out.spend = spend.toFixed(2)
  }
  if (isBlank(out.sales) && Number.isFinite(spend) && Number.isFinite(acos) && acos > 0) {
    sales = spend / (acos / 100)
    out.sales = sales.toFixed(2)
  }
  if (isBlank(out.cpc) && Number.isFinite(spend) && Number.isFinite(clicks) && clicks > 0) {
    cpc = spend / clicks
    out.cpc = cpc.toFixed(2)
  }
  if (isBlank(out.acos) && Number.isFinite(spend) && Number.isFinite(sales) && sales > 0) {
    acos = (spend / sales) * 100
    out.acos = String(Math.round(acos * 100) / 100)
  }
  if (isBlank(out.ctr) && Number.isFinite(clicks) && Number.isFinite(impressions) && impressions > 0) {
    const ctr = (clicks / impressions) * 100
    out.ctr = String(Math.round(ctr * 100) / 100)
  }
  if (isBlank(out.cvr) && Number.isFinite(clicks) && Number.isFinite(orders) && clicks > 0 && orders >= 0) {
    const cvr = (orders / clicks) * 100
    out.cvr = String(Math.round(cvr * 100) / 100)
  }

  return { ...row, ...out }
}
