import { normalize } from '../../utils/normalize'
import { detectSpendColumn, parseCSV } from '../../utils/csv'

/**
 * Extract the KEYWORD from a campaign title in format:
 * (INTENT) I KEYWORD I EXACT I SP I ASIN
 * e.g. (WATER) I water test strips I EXACT I SP I B0DV3ZG4
 *
 * Also accepts a lowercase "l" instead of "I" after the intent (common typo in exports):
 * (UTI) l uti test I EXACT ...
 */
export function extractKeywordFromExactTitle(title: string): string | null {
  if (!title || typeof title !== 'string') return null
  const s = title.trim()

  const match = s.match(/\)\s*[Il]\s+(.+?)\s+I\s+EXACT\s+/i)
  if (match && match[1]) return match[1].trim()

  const spForm = s.match(/\)\s*[Il]\s+(.+?)\s+I\s+EXACT\s+I\s+SP\s+I\s+[A-Z0-9]{8,12}\s*$/i)
  if (spForm && spForm[1]) return spForm[1].trim()

  /** Titles that end with ` I B0…` but skip the usual keyword ` I EXACT ` slot (e.g. SB / other suffixes). */
  const asinAtEnd = s.match(/\s+I\s+(B[0-9A-Z]{9})\s*$/i)
  if (!asinAtEnd) return null
  const prefix = s.slice(0, s.length - asinAtEnd[0].length).trim()
  const loose = prefix.match(/\)\s*[Il]\s+(.+)/i)
  return loose?.[1]?.trim() || null
}

/**
 * CUSTOM MANUAL KEYWORDS (Auto → Exact): each line is the **keyword** segment from
 * `(INTENT) I keyword I EXACT I SP I ASIN`, matching how the Reference Exact CSV keys terms.
 * If a line is a full campaign title, the keyword is taken via {@link extractKeywordFromExactTitle};
 * otherwise the trimmed line is used as-is. Does not affect uploaded Search Term CSV rows.
 */
export function manualExactKeywordSegmentsFromLines(rawLines: string[]): string[] {
  const out: string[] = []
  for (const raw of rawLines) {
    const t = String(raw ?? '').trim()
    if (!t) continue
    const seg = (extractKeywordFromExactTitle(t) ?? t).trim()
    if (seg) out.push(seg)
  }
  return out
}

/** ASIN: prefer `… I SP I B0…`; else last ` I B0…` segment (SB / legacy rows). */
export function extractAsinFromExactTitle(title: string): string | null {
  const s = String(title ?? '').trim()
  let m = s.match(/\bI\s+SP\s+I\s+([A-Z0-9]{8,12})\s*$/i)
  if (m) return m[1].trim().toUpperCase()
  m = s.match(/\bI\s+(B[0-9A-Z]{9})\s*$/i)
  if (m) return m[1].trim().toUpperCase()
  return null
}

/** Separator for Map keys: normalized keyword + ASIN (must not appear in norm or ASIN) */
export const REFERENCE_KEY_SEP = '|||' as const

/** ASIN placeholder when targeting exports have keywords but no product column. */
export const REFERENCE_TARGETING_PLACEHOLDER_ASIN = '_TARGETING_' as const

export function referenceCompositeKey(normalizedTerm: string, asin: string): string {
  return `${normalizedTerm}${REFERENCE_KEY_SEP}${asin.trim().toUpperCase()}`
}

/**
 * Resolve reference metrics for a source row. When Export ASIN is set, match that product only.
 * When unset, if multiple products share the same keyword, uses the first key in sorted order (deterministic).
 * Targeting exports without ASIN use {@link REFERENCE_TARGETING_PLACEHOLDER_ASIN} as fallback.
 */
export function lookupReferenceMetrics(
  map: Map<string, ReferenceExactMetrics> | null | undefined,
  normalizedTerm: string,
  preferredAsin: string | null
): ReferenceExactMetrics | null {
  if (!map || map.size === 0) return null
  const pa = preferredAsin?.trim()
  if (pa) {
    const k = referenceCompositeKey(normalizedTerm, pa)
    return (
      map.get(k) ??
      map.get(referenceCompositeKey(normalizedTerm, REFERENCE_TARGETING_PLACEHOLDER_ASIN)) ??
      null
    )
  }
  const placeholderKey = referenceCompositeKey(normalizedTerm, REFERENCE_TARGETING_PLACEHOLDER_ASIN)
  if (map.has(placeholderKey)) return map.get(placeholderKey) ?? null
  const prefix = `${normalizedTerm}${REFERENCE_KEY_SEP}`
  const keys = [...map.keys()].filter((k) => k.startsWith(prefix))
  if (keys.length === 0) return null
  keys.sort()
  return map.get(keys[0]) ?? null
}

/** Find column index whose header contains "campaign" (case-insensitive) */
export function findCampaignNameColumn(headers: string[]): number {
  const lower = headers.map((h) => (h ?? '').trim().toLowerCase().replace(/^"+|"+$/g, ''))
  const idx = lower.findIndex((h) => h.includes('campaign'))
  return idx >= 0 ? idx : 0
}

function findColumn(headers: string[], ...substrings: string[]): number {
  const lower = headers.map((h) => (h ?? '').trim().toLowerCase().replace(/^"+|"+$/g, ''))
  for (const sub of substrings) {
    const idx = lower.findIndex((h) => h.includes(sub))
    if (idx >= 0) return idx
  }
  return -1
}

function findExactKeywordColumn(headers: string[]): number {
  const lower = headers.map((h) => (h ?? '').trim().toLowerCase().replace(/^"+|"+$/g, ''))
  for (let i = 0; i < lower.length; i++) {
    if (lower[i] === 'keyword') return i
  }
  return -1
}

function findMatchTypeColumn(headers: string[]): number {
  const lower = headers.map((h) => (h ?? '').trim().toLowerCase().replace(/^"+|"+$/g, ''))
  for (let i = 0; i < lower.length; i++) {
    const h = lower[i]
    if (h === 'target match type' || h === 'match type') return i
  }
  return -1
}

function findAsinColumn(headers: string[]): number {
  const lower = headers.map((h) => (h ?? '').trim().toLowerCase().replace(/^"+|"+$/g, ''))
  for (let i = 0; i < lower.length; i++) {
    const h = lower[i]
    if (h === 'asin' || h === 'advertised asin' || h === 'product asin') return i
  }
  return -1
}

function parseAsinCell(raw: string): string | null {
  const s = String(raw ?? '').trim().replace(/^"+|"+$/g, '').toUpperCase()
  const m = s.match(/\b(B[0-9A-Z]{9})\b/)
  return m ? m[1] : null
}

function parseNum(val: string): number {
  const s = String(val ?? '').trim().replace(/[$,£€\s]/g, '')
  if (!s) return 0
  const n = parseFloat(s.replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

export interface ReferenceExactMetrics {
  orders: number
  sales: number
  spend: number
  acosPct: number
  clicks: number
  cvrPct: number | null
  /** Sales / Spend when spend is positive (Exact export has no ROAS column). */
  roas: number | null
}

export type ReferenceExactFormat = 'campaign-title' | 'targeting-export'

export interface ReferenceExactResult {
  /** Composite keys (normalized keyword + ASIN) — one per distinct keyword × product */
  keywords: Set<string>
  metricsByKeyword: Map<string, ReferenceExactMetrics>
  /** Rows in the CSV that matched the EXACT title pattern and had an ASIN */
  campaignRowCount: number
  /** Normalized keywords present in any reference row (for “hide already in Exact”) */
  normalizedTermsInReference: Set<string>
  /** Normalized campaign names present in uploaded Reference Exact CSV. */
  campaignNamesInReference: Set<string>
  /** Which Reference Exact CSV layout was detected. */
  referenceFormat?: ReferenceExactFormat
}

export function normalizeCampaignNameForMatch(name: string): string {
  return String(name ?? '')
    .trim()
    .replace(/^"+|"+$/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function emptyReferenceExactResult(): ReferenceExactResult {
  return {
    keywords: new Set<string>(),
    metricsByKeyword: new Map(),
    campaignRowCount: 0,
    normalizedTermsInReference: new Set<string>(),
    campaignNamesInReference: new Set<string>(),
  }
}

function mergeReferenceMetrics(
  metricsByKeyword: Map<string, ReferenceExactMetrics>,
  key: string,
  spend: number,
  sales: number,
  orders: number,
  clicks: number
): void {
  const acosPct = sales > 0 ? (spend / sales) * 100 : 0
  const cvrPct = clicks > 0 ? (orders / clicks) * 100 : null
  const roas = spend > 0 ? sales / spend : null

  const existing = metricsByKeyword.get(key)
  if (existing) {
    existing.orders += orders
    existing.sales += sales
    existing.spend += spend
    existing.clicks += clicks
    existing.acosPct = existing.sales > 0 ? (existing.spend / existing.sales) * 100 : 0
    existing.cvrPct = existing.clicks > 0 ? (existing.orders / existing.clicks) * 100 : null
    existing.roas = existing.spend > 0 ? existing.sales / existing.spend : null
  } else {
    metricsByKeyword.set(key, {
      orders,
      sales,
      spend,
      acosPct,
      clicks,
      cvrPct,
      roas,
    })
  }
}

function isExactTargetingExport(headers: string[]): boolean {
  return findExactKeywordColumn(headers) >= 0 && findMatchTypeColumn(headers) >= 0
}

function parseCampaignTitleReferenceExact(rows: string[][]): ReferenceExactResult {
  const result = emptyReferenceExactResult()
  if (rows.length < 2) return result

  const headers = rows[0].map((h) => (h ?? '').trim())
  const campaignCol = findCampaignNameColumn(headers)
  const targetingCol = findColumn(headers, 'targeting', 'keyword')
  const spendCol = detectSpendColumn(headers)
  const salesCol = findColumn(headers, 'sales', 'attributed')
  const ordersCol = findColumn(headers, 'orders', 'purchases', 'unit')
  const clicksCol = findColumn(headers, 'clicks')

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const campaignCell = (row[campaignCol] ?? '').trim().replace(/^"+|"+$/g, '')
    const normalizedCampaignName = normalizeCampaignNameForMatch(campaignCell)
    if (normalizedCampaignName) result.campaignNamesInReference.add(normalizedCampaignName)
    let keyword = extractKeywordFromExactTitle(campaignCell)
    if (!keyword && targetingCol >= 0) {
      const targetingCell = (row[targetingCol] ?? '').trim().replace(/^"+|"+$/g, '')
      if (targetingCell && /exact/i.test(campaignCell)) keyword = targetingCell
    }
    if (!keyword) continue

    const asin = extractAsinFromExactTitle(campaignCell)
    if (!asin) continue

    const norm = normalize(keyword)
    if (!norm) continue

    const key = referenceCompositeKey(norm, asin)
    result.campaignRowCount++
    result.normalizedTermsInReference.add(norm)
    result.keywords.add(key)

    const spend = spendCol >= 0 ? parseNum(row[spendCol] ?? '') : 0
    const sales = salesCol >= 0 ? parseNum(row[salesCol] ?? '') : 0
    const orders = ordersCol >= 0 ? parseNum(row[ordersCol] ?? '') : 0
    const clicks = clicksCol >= 0 ? parseNum(row[clicksCol] ?? '') : 0

    mergeReferenceMetrics(result.metricsByKeyword, key, spend, sales, orders, clicks)
  }

  if (result.campaignRowCount > 0) result.referenceFormat = 'campaign-title'
  return result
}

function parseExactTargetingExport(rows: string[][]): ReferenceExactResult {
  const result = emptyReferenceExactResult()
  if (rows.length < 2) return result

  const headers = rows[0].map((h) => (h ?? '').trim())
  const keywordCol = findExactKeywordColumn(headers)
  const matchTypeCol = findMatchTypeColumn(headers)
  if (keywordCol < 0 || matchTypeCol < 0) return result

  const asinCol = findAsinColumn(headers)
  const spendCol = detectSpendColumn(headers)
  const salesCol = findColumn(headers, 'sales', 'attributed')
  const ordersCol = findColumn(headers, 'orders', 'purchases', 'unit')
  const clicksCol = findColumn(headers, 'clicks')

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const matchType = (row[matchTypeCol] ?? '').trim().toUpperCase()
    if (matchType !== 'EXACT') continue

    const keyword = (row[keywordCol] ?? '').trim().replace(/^"+|"+$/g, '')
    if (!keyword) continue

    const norm = normalize(keyword)
    if (!norm) continue

    const asin =
      asinCol >= 0
        ? parseAsinCell(row[asinCol] ?? '') ?? REFERENCE_TARGETING_PLACEHOLDER_ASIN
        : REFERENCE_TARGETING_PLACEHOLDER_ASIN

    const key = referenceCompositeKey(norm, asin)
    result.campaignRowCount++
    result.normalizedTermsInReference.add(norm)
    result.keywords.add(key)

    const spend = spendCol >= 0 ? parseNum(row[spendCol] ?? '') : 0
    const sales = salesCol >= 0 ? parseNum(row[salesCol] ?? '') : 0
    const orders = ordersCol >= 0 ? parseNum(row[ordersCol] ?? '') : 0
    const clicks = clicksCol >= 0 ? parseNum(row[clicksCol] ?? '') : 0

    mergeReferenceMetrics(result.metricsByKeyword, key, spend, sales, orders, clicks)
  }

  if (result.campaignRowCount > 0) result.referenceFormat = 'targeting-export'
  return result
}

/**
 * Parse Reference Exact CSV and return a Set of composite keys (keyword+ASIN).
 */
export function parseReferenceExactCsv(csvText: string): Set<string> {
  return parseReferenceExactCsvWithMetrics(csvText).keywords
}

/**
 * Parse Reference Exact CSV. Metrics aggregate only when the same normalized keyword **and** same ASIN
 * appear in multiple rows (e.g. duplicate lines). Different ASINs = separate entries.
 *
 * Supports campaign-title exports first; falls back to Exact targeting exports (Keyword + EXACT match type).
 */
export function parseReferenceExactCsvWithMetrics(csvText: string): ReferenceExactResult {
  const rows = parseCSV(csvText)
  if (rows.length < 2) return emptyReferenceExactResult()

  const campaignResult = parseCampaignTitleReferenceExact(rows)
  if (campaignResult.campaignRowCount > 0) return campaignResult

  const headers = rows[0].map((h) => (h ?? '').trim())
  if (isExactTargetingExport(headers)) return parseExactTargetingExport(rows)

  return campaignResult
}

const REFERENCE_EXACT_STORAGE_KEY = 'auto-exact-reference-exact-v1'

export interface PersistedReferenceExact {
  fileName?: string
  campaignRowCount: number
  referenceFormat?: ReferenceExactFormat
  keywords: string[]
  metricsByKeyword: [string, ReferenceExactMetrics][]
  normalizedTermsInReference: string[]
  campaignNamesInReference: string[]
}

export function serializeReferenceExactResult(
  result: ReferenceExactResult,
  fileName?: string
): PersistedReferenceExact {
  return {
    fileName,
    campaignRowCount: result.campaignRowCount,
    referenceFormat: result.referenceFormat,
    keywords: [...result.keywords],
    metricsByKeyword: [...result.metricsByKeyword.entries()],
    normalizedTermsInReference: [...result.normalizedTermsInReference],
    campaignNamesInReference: [...result.campaignNamesInReference],
  }
}

export function deserializeReferenceExactResult(data: PersistedReferenceExact): ReferenceExactResult {
  return {
    keywords: new Set(data.keywords),
    metricsByKeyword: new Map(data.metricsByKeyword),
    campaignRowCount: data.campaignRowCount,
    normalizedTermsInReference: new Set(data.normalizedTermsInReference),
    campaignNamesInReference: new Set(data.campaignNamesInReference),
    referenceFormat: data.referenceFormat,
  }
}

function isPersistedReferenceExact(v: unknown): v is PersistedReferenceExact {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    typeof o.campaignRowCount === 'number' &&
    Array.isArray(o.keywords) &&
    Array.isArray(o.metricsByKeyword) &&
    Array.isArray(o.normalizedTermsInReference) &&
    Array.isArray(o.campaignNamesInReference)
  )
}

export function loadPersistedReferenceExact(): {
  result: ReferenceExactResult
  fileName: string
} | null {
  try {
    const raw = localStorage.getItem(REFERENCE_EXACT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    if (!isPersistedReferenceExact(parsed)) return null
    if (parsed.campaignRowCount <= 0 && parsed.keywords.length === 0) return null
    return {
      result: deserializeReferenceExactResult(parsed),
      fileName: typeof parsed.fileName === 'string' ? parsed.fileName : '',
    }
  } catch {
    return null
  }
}

export function savePersistedReferenceExact(result: ReferenceExactResult, fileName?: string): void {
  if (result.campaignRowCount <= 0 && result.keywords.size === 0) {
    clearPersistedReferenceExact()
    return
  }
  localStorage.setItem(
    REFERENCE_EXACT_STORAGE_KEY,
    JSON.stringify(serializeReferenceExactResult(result, fileName))
  )
}

export function clearPersistedReferenceExact(): void {
  localStorage.removeItem(REFERENCE_EXACT_STORAGE_KEY)
}
