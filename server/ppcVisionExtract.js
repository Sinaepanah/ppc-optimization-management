/**
 * Exact Bid Tools — screenshot → structured JSON via OpenAI vision.
 * Used only by POST /api/ppc/extract-screenshot.
 */

const AD_LEVEL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    bid: { type: 'string' },
    impressions: { type: 'string' },
    clicks: { type: 'string' },
    totalCost: { type: 'string' },
    cpc: { type: 'string' },
    purchases: { type: 'string' },
    sales: { type: 'string' },
    acos: { type: 'string' },
  },
  required: [
    'bid',
    'impressions',
    'clicks',
    'totalCost',
    'cpc',
    'purchases',
    'sales',
    'acos',
  ],
}

const PLACEMENT_ROW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    bidAdjustment: { type: 'string' },
    impressions: { type: 'string' },
    clicks: { type: 'string' },
    ctr: { type: 'string' },
    totalCost: { type: 'string' },
    cpc: { type: 'string' },
    purchases: { type: 'string' },
    sales: { type: 'string' },
    acos: { type: 'string' },
  },
  required: [
    'bidAdjustment',
    'impressions',
    'clicks',
    'ctr',
    'totalCost',
    'cpc',
    'purchases',
    'sales',
    'acos',
  ],
}

const PLACEMENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    topOfSearch: PLACEMENT_ROW_SCHEMA,
    restOfSearch: PLACEMENT_ROW_SCHEMA,
    productPages: PLACEMENT_ROW_SCHEMA,
  },
  required: ['topOfSearch', 'restOfSearch', 'productPages'],
}

const BULK_KEYWORD_ROW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    keyword: { type: 'string' },
    matchType: { type: 'string' },
    bid: { type: 'string' },
    impressions: { type: 'string' },
    clicks: { type: 'string' },
    spend: { type: 'string' },
    cpc: { type: 'string' },
    orders: { type: 'string' },
    sales: { type: 'string' },
    acos: { type: 'string' },
    ctr: { type: 'string' },
  },
  required: [
    'keyword',
    'matchType',
    'bid',
    'impressions',
    'clicks',
    'spend',
    'cpc',
    'orders',
    'sales',
    'acos',
    'ctr',
  ],
}

const BULK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    keywords: {
      type: 'array',
      items: BULK_KEYWORD_ROW_SCHEMA,
    },
  },
  required: ['keywords'],
}

const BULK_PROMPT = `You extract Amazon Advertising keyword / targeting table rows from a screenshot for bulk PPC optimization.

Return ONLY JSON: { "keywords": [ ... ] }
Each keyword object has string fields:
keyword, matchType, bid, impressions, clicks, spend, cpc, orders, sales, acos, ctr

Rules:
- Extract EVERY visible data row (not the header, not blank spacer rows).
- Read numbers exactly as shown. Do not invent values.
- Empty / dash / em-dash cells → ""
- matchType: EXACT / PHRASE / BROAD / or "" if not shown
- Currency: "$X.XX" (£ → $ same number) for bid, spend, cpc, sales
- ACOS: numeric percent only, no % sign
- CTR: like "0.82%" or "" if missing
- If Spend / Total cost column is NOT visible, spend MUST be ""
- Never copy CPC into spend
- If Purchases/Orders column exists use it for orders; else ""
- If a column is not visible, leave that field ""
- Include keyword text from the Keyword / Targeting column`

const AD_LEVEL_PROMPT = `You extract Amazon Advertising Campaign Manager ad-level metrics from a screenshot.

Return ONLY JSON with these string fields:
bid, impressions, clicks, totalCost, cpc, purchases, sales, acos

Rules:
- Read numbers exactly as shown. Do not invent values.
- Empty / dash / em-dash cells → ""
- Currency: keep as "$X.XX" (convert £ to $ with the same number)
- ACOS: numeric percent only, no % sign (e.g. "42.16" not "42.16%")
- Bid / Total cost / CPC / Sales: include $ prefix
- Impressions / Clicks / Purchases: digits only, commas allowed
- If Total cost / Spend column is not visible, totalCost MUST be ""
- Never copy CPC into totalCost
- If a metric column is not visible in the image, leave that field as ""
- Do not invent Total cost or Sales when those columns are absent — leave them ""
- Ignore keyword names, status, and "Top of search IS" (impression share) columns
- If multiple rows, use the primary keyword / selected data row with metric values`

const PLACEMENT_PROMPT = `You extract Amazon Advertising Campaign Manager placement metrics from a screenshot table.

Return ONLY JSON with three objects: topOfSearch, restOfSearch, productPages.
Each object has string fields:
bidAdjustment, impressions, clicks, ctr, totalCost, cpc, purchases, sales, acos

Row mapping:
- topOfSearch = "Top of search" / "Top of search (first page)"
- restOfSearch = "Rest of search"
- productPages = "Product pages"

Rules:
- Read numbers exactly as shown. Do not invent values.
- Empty / dash / em-dash cells → ""
- bidAdjustment: like "0%" or "50%" (include %)
- ctr: like "0.31%" (include %)
- ACOS: numeric percent only, no % sign
- Currency fields: "$X.XX" (£ → $ same number)
- Ignore header and Total rows for the three placement objects
- Many Amazon placement screenshots do NOT show Total cost / Spend — if that column header is not visible, totalCost MUST be ""
- Never copy CPC into totalCost. CPC and Total cost are different fields.
- If a metric column is not visible for a row, leave that field as ""
- Do not invent Total cost or Sales when those columns are absent — leave them ""
- If a placement row is missing, still return the object with all ""`

function emptyAdLevel() {
  return {
    bid: '',
    impressions: '',
    clicks: '',
    totalCost: '',
    cpc: '',
    purchases: '',
    sales: '',
    acos: '',
  }
}

function emptyPlacementRow() {
  return {
    bidAdjustment: '',
    impressions: '',
    clicks: '',
    ctr: '',
    totalCost: '',
    cpc: '',
    purchases: '',
    sales: '',
    acos: '',
  }
}

function emptyPlacement() {
  return {
    topOfSearch: emptyPlacementRow(),
    restOfSearch: emptyPlacementRow(),
    productPages: emptyPlacementRow(),
  }
}

function asString(v) {
  if (v == null) return ''
  return String(v).trim()
}

function normalizeCurrency(raw) {
  const s = asString(raw)
  if (!s || /^[—\-–]+$/.test(s)) return ''
  const m = s.replace(/,/g, '').match(/[\$£]?\s*(\d+(?:\.\d+)?)/)
  if (!m) return s.startsWith('$') ? s : s ? `$${s.replace(/[\$£]/g, '')}` : ''
  const num = parseFloat(m[1])
  if (!Number.isFinite(num)) return ''
  return `$${num.toFixed(2)}`
}

function normalizeInt(raw) {
  const s = asString(raw)
  if (!s || /^[—\-–]+$/.test(s)) return ''
  const cleaned = s.replace(/[^\d,]/g, '')
  return cleaned
}

function normalizeAcos(raw) {
  const s = asString(raw)
  if (!s || /^[—\-–]+$/.test(s)) return ''
  const m = s.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/)
  if (!m) return ''
  let n = parseFloat(m[1])
  if (!Number.isFinite(n)) return ''
  if (n > 0 && n < 1) n = n * 100
  return String(n)
}

function normalizePercentWithSign(raw) {
  const s = asString(raw)
  if (!s || /^[—\-–]+$/.test(s)) return ''
  const m = s.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/)
  if (!m) return s.includes('%') ? s : `${s}%`
  return `${m[1]}%`
}

function normalizeAdLevel(data) {
  const src = data && typeof data === 'object' ? data : {}
  return {
    bid: normalizeCurrency(src.bid),
    impressions: normalizeInt(src.impressions),
    clicks: normalizeInt(src.clicks),
    totalCost: normalizeCurrency(src.totalCost),
    cpc: normalizeCurrency(src.cpc),
    purchases: normalizeInt(src.purchases),
    sales: normalizeCurrency(src.sales),
    acos: normalizeAcos(src.acos),
  }
}

function normalizePlacementRow(row) {
  const src = row && typeof row === 'object' ? row : {}
  return {
    bidAdjustment: normalizePercentWithSign(src.bidAdjustment),
    impressions: normalizeInt(src.impressions),
    clicks: normalizeInt(src.clicks),
    ctr: normalizePercentWithSign(src.ctr),
    totalCost: normalizeCurrency(src.totalCost),
    cpc: normalizeCurrency(src.cpc),
    purchases: normalizeInt(src.purchases),
    sales: normalizeCurrency(src.sales),
    acos: normalizeAcos(src.acos),
  }
}

function normalizePlacement(data) {
  const src = data && typeof data === 'object' ? data : {}
  return {
    topOfSearch: {
      placementName: 'Top of search (first page)',
      ...normalizePlacementRow(src.topOfSearch),
    },
    restOfSearch: {
      placementName: 'Rest of search',
      ...normalizePlacementRow(src.restOfSearch),
    },
    productPages: {
      placementName: 'Product pages',
      ...normalizePlacementRow(src.productPages),
    },
  }
}

function isBlank(v) {
  const s = asString(v)
  return !s || /^[—\-–]+$/.test(s)
}

function parseMoney(v) {
  if (isBlank(v)) return NaN
  const m = String(v).replace(/,/g, '').match(/(\d+(?:\.\d+)?)/)
  return m ? parseFloat(m[1]) : NaN
}

function parseCount(v) {
  if (isBlank(v)) return NaN
  const m = String(v).replace(/,/g, '').match(/(\d+)/)
  return m ? parseInt(m[1], 10) : NaN
}

function parseAcosNum(v) {
  if (isBlank(v)) return NaN
  const m = String(v).replace(/,/g, '').match(/(\d+(?:\.\d+)?)/)
  if (!m) return NaN
  let n = parseFloat(m[1])
  if (n > 0 && n < 1) n *= 100
  return n
}

/**
 * Fill blank metric fields using Amazon identities.
 * Also repairs common vision mistakes when Total cost/Spend is absent from the
 * screenshot but the model copied CPC into totalCost (totalCost ≈ cpc while clicks > 1).
 *
 * Prefer: spend = sales × (ACOS/100), else spend = clicks × CPC.
 * Never overwrite a totalCost that already agrees with sales×ACOS or clicks×CPC.
 */
function nearlyEqual(a, b, absTol = 0.02, relTol = 0.05) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  const diff = Math.abs(a - b)
  if (diff <= absTol) return true
  const scale = Math.max(Math.abs(a), Math.abs(b), 1e-9)
  return diff / scale <= relTol
}

function isBogusTotalCost(totalCost, cpc, clicks, sales, acos) {
  if (!Number.isFinite(totalCost)) return true
  // Classic failure: model put CPC into Total cost when Spend column missing
  if (Number.isFinite(cpc) && Number.isFinite(clicks) && clicks > 1 && nearlyEqual(totalCost, cpc, 0.02, 0.02)) {
    return true
  }
  // Conflicts hard with ACOS identity when Sales + ACOS are present
  if (Number.isFinite(sales) && Number.isFinite(acos) && acos > 0 && sales >= 0) {
    const fromAcos = sales * (acos / 100)
    if (fromAcos >= 0.01 && !nearlyEqual(totalCost, fromAcos, 0.5, 0.25)) {
      // If clicks×cpc also disagrees, definitely bogus; if clicks×cpc agrees with fromAcos, trust fromAcos path
      if (Number.isFinite(clicks) && Number.isFinite(cpc) && clicks > 0) {
        const fromCpc = clicks * cpc
        if (nearlyEqual(fromAcos, fromCpc, 1.0, 0.15) && !nearlyEqual(totalCost, fromCpc, 0.5, 0.25)) {
          return true
        }
      }
      if (Number.isFinite(clicks) && clicks > 1 && Number.isFinite(cpc) && nearlyEqual(totalCost, cpc, 0.05, 0.05)) {
        return true
      }
    }
  }
  return false
}

function deriveMissingMetrics(row, { includeCtr = false } = {}) {
  const out = { ...row }

  const clicks = parseCount(out.clicks)
  const impressions = parseCount(out.impressions)
  let totalCost = parseMoney(out.totalCost)
  let cpc = parseMoney(out.cpc)
  let sales = parseMoney(out.sales)
  let acos = parseAcosNum(out.acos)

  if (isBogusTotalCost(totalCost, cpc, clicks, sales, acos)) {
    out.totalCost = ''
    totalCost = NaN
  }

  // Prefer Sales × ACOS (Amazon definition) when Spend column missing
  if (isBlank(out.totalCost) && Number.isFinite(sales) && Number.isFinite(acos) && acos > 0 && sales >= 0) {
    totalCost = sales * (acos / 100)
    out.totalCost = `$${totalCost.toFixed(2)}`
  }
  if (isBlank(out.totalCost) && Number.isFinite(clicks) && Number.isFinite(cpc) && clicks >= 0 && cpc >= 0) {
    totalCost = clicks * cpc
    out.totalCost = `$${totalCost.toFixed(2)}`
  }
  if (isBlank(out.sales) && Number.isFinite(totalCost) && Number.isFinite(acos) && acos > 0) {
    sales = totalCost / (acos / 100)
    out.sales = `$${sales.toFixed(2)}`
  }
  if (isBlank(out.cpc) && Number.isFinite(totalCost) && Number.isFinite(clicks) && clicks > 0) {
    cpc = totalCost / clicks
    out.cpc = `$${cpc.toFixed(2)}`
  }
  if (isBlank(out.acos) && Number.isFinite(totalCost) && Number.isFinite(sales) && sales > 0) {
    acos = (totalCost / sales) * 100
    out.acos = String(Math.round(acos * 100) / 100)
  }
  if (
    includeCtr &&
    isBlank(out.ctr) &&
    Number.isFinite(clicks) &&
    Number.isFinite(impressions) &&
    impressions > 0
  ) {
    const ctr = (clicks / impressions) * 100
    out.ctr = `${Math.round(ctr * 100) / 100}%`
  }

  return out
}

function deriveMissingAdLevel(data) {
  return deriveMissingMetrics(data, { includeCtr: false })
}

function deriveMissingPlacement(data) {
  return {
    topOfSearch: {
      ...data.topOfSearch,
      ...deriveMissingMetrics(data.topOfSearch, { includeCtr: true }),
      placementName: data.topOfSearch.placementName,
    },
    restOfSearch: {
      ...data.restOfSearch,
      ...deriveMissingMetrics(data.restOfSearch, { includeCtr: true }),
      placementName: data.restOfSearch.placementName,
    },
    productPages: {
      ...data.productPages,
      ...deriveMissingMetrics(data.productPages, { includeCtr: true }),
      placementName: data.productPages.placementName,
    },
  }
}

function parseJsonContent(content) {
  const text = asString(content)
  if (!text) throw new Error('Empty model response')
  try {
    return JSON.parse(text)
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1))
    }
    throw new Error('Model did not return valid JSON')
  }
}

/**
 * @param {{ imageBase64: string, mimeType: string, mode: 'adLevel' | 'placement' | 'bulkKeywords', apiKey: string, model?: string }} opts
 */
export async function extractPpcFromScreenshot(opts) {
  const { imageBase64, mimeType, mode, apiKey } = opts
  const model = opts.model || process.env.OPENAI_VISION_MODEL || 'gpt-4o'

  if (!apiKey) {
    const err = new Error('OPENAI_API_KEY is not configured on the server')
    err.status = 503
    throw err
  }
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    const err = new Error('imageBase64 is required')
    err.status = 400
    throw err
  }
  if (mode !== 'adLevel' && mode !== 'placement' && mode !== 'bulkKeywords') {
    const err = new Error('mode must be adLevel, placement, or bulkKeywords')
    err.status = 400
    throw err
  }

  const mime = mimeType && String(mimeType).startsWith('image/') ? mimeType : 'image/png'
  const dataUrl = `data:${mime};base64,${imageBase64.replace(/^data:[^;]+;base64,/, '')}`

  let schema
  let schemaName
  let prompt
  if (mode === 'adLevel') {
    schema = AD_LEVEL_SCHEMA
    schemaName = 'ad_level_ppc'
    prompt = AD_LEVEL_PROMPT
  } else if (mode === 'placement') {
    schema = PLACEMENT_SCHEMA
    schemaName = 'placement_ppc'
    prompt = PLACEMENT_PROMPT
  } else {
    schema = BULK_SCHEMA
    schemaName = 'bulk_keywords_ppc'
    prompt = BULK_PROMPT
  }

  const body = {
    model,
    temperature: 0,
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: schemaName,
        strict: true,
        schema,
      },
    },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
        ],
      },
    ],
  }

  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const raw = await resp.text()
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    const err = new Error(`OpenAI returned non-JSON (${resp.status})`)
    err.status = 502
    throw err
  }

  if (!resp.ok) {
    const msg =
      parsed?.error?.message ||
      parsed?.error?.code ||
      `OpenAI error ${resp.status}`
    const err = new Error(msg)
    err.status = resp.status === 401 || resp.status === 429 ? resp.status : 502
    throw err
  }

  const content = parsed?.choices?.[0]?.message?.content
  const data = parseJsonContent(content)

  if (mode === 'adLevel') {
    const out = deriveMissingAdLevel(normalizeAdLevel(data))
    const filled = Object.values(out).filter((v) => v !== '').length
    if (filled === 0) return { ...emptyAdLevel(), ...out }
    return out
  }

  if (mode === 'placement') {
    return deriveMissingPlacement(normalizePlacement(data))
  }

  return normalizeBulkKeywords(data)
}

function normalizeBulkKeyword(row) {
  const src = row && typeof row === 'object' ? row : {}
  // Map into ad-level derive shape (totalCost/purchases), then back to bulk field names
  const derived = deriveMissingMetrics(
    {
      bid: normalizeCurrency(src.bid),
      impressions: normalizeInt(src.impressions),
      clicks: normalizeInt(src.clicks),
      totalCost: normalizeCurrency(src.spend),
      cpc: normalizeCurrency(src.cpc),
      purchases: normalizeInt(src.orders),
      sales: normalizeCurrency(src.sales),
      acos: normalizeAcos(src.acos),
      ctr: asString(src.ctr),
    },
    { includeCtr: true }
  )
  return {
    keyword: asString(src.keyword),
    matchType: asString(src.matchType),
    bid: derived.bid?.replace(/^\$/, '') ?? '',
    impressions: derived.impressions ?? '',
    clicks: derived.clicks ?? '',
    spend: (derived.totalCost || '').replace(/^\$/, ''),
    cpc: (derived.cpc || '').replace(/^\$/, ''),
    orders: derived.purchases ?? '',
    sales: (derived.sales || '').replace(/^\$/, ''),
    acos: derived.acos ?? '',
    ctr: derived.ctr ?? '',
  }
}

function normalizeBulkKeywords(data) {
  const list = Array.isArray(data?.keywords) ? data.keywords : []
  const keywords = list
    .map(normalizeBulkKeyword)
    .filter((k) => k.keyword || k.clicks || k.impressions || k.bid)
  return { keywords }
}

export {
  emptyAdLevel,
  emptyPlacement,
  deriveMissingAdLevel,
  deriveMissingPlacement,
  deriveMissingMetrics,
  normalizeBulkKeywords,
}
