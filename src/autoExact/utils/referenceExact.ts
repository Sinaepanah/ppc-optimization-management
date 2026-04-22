import { normalize } from '../../utils/normalize'
import { parseCSV } from '../../utils/csv'

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

export function referenceCompositeKey(normalizedTerm: string, asin: string): string {
  return `${normalizedTerm}${REFERENCE_KEY_SEP}${asin.trim().toUpperCase()}`
}

/**
 * Resolve reference metrics for a source row. When Export ASIN is set, match that product only.
 * When unset, if multiple products share the same keyword, uses the first key in sorted order (deterministic).
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
    return map.get(k) ?? null
  }
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
}

export function normalizeCampaignNameForMatch(name: string): string {
  return String(name ?? '')
    .trim()
    .replace(/^"+|"+$/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
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
 */
export function parseReferenceExactCsvWithMetrics(csvText: string): ReferenceExactResult {
  const rows = parseCSV(csvText)
  const keywords = new Set<string>()
  const metricsByKeyword = new Map<string, ReferenceExactMetrics>()
  const normalizedTermsInReference = new Set<string>()
  const campaignNamesInReference = new Set<string>()

  if (rows.length < 2) {
    return { keywords, metricsByKeyword, campaignRowCount: 0, normalizedTermsInReference, campaignNamesInReference }
  }

  let campaignRowCount = 0
  const headers = rows[0].map((h) => (h ?? '').trim())
  const campaignCol = findCampaignNameColumn(headers)
  const targetingCol = findColumn(headers, 'targeting', 'keyword')
  const spendCol = findColumn(headers, 'spend', 'cost', 'total')
  const salesCol = findColumn(headers, 'sales', 'attributed')
  const ordersCol = findColumn(headers, 'orders', 'purchases', 'unit')
  const clicksCol = findColumn(headers, 'clicks')

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const campaignCell = (row[campaignCol] ?? '').trim().replace(/^"+|"+$/g, '')
    const normalizedCampaignName = normalizeCampaignNameForMatch(campaignCell)
    if (normalizedCampaignName) campaignNamesInReference.add(normalizedCampaignName)
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
    campaignRowCount++
    normalizedTermsInReference.add(norm)
    keywords.add(key)

    const spend = spendCol >= 0 ? parseNum(row[spendCol] ?? '') : 0
    const sales = salesCol >= 0 ? parseNum(row[salesCol] ?? '') : 0
    const orders = ordersCol >= 0 ? parseNum(row[ordersCol] ?? '') : 0
    const clicks = clicksCol >= 0 ? parseNum(row[clicksCol] ?? '') : 0

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

  return { keywords, metricsByKeyword, campaignRowCount, normalizedTermsInReference, campaignNamesInReference }
}
