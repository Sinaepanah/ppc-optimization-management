import { normalize } from '../../utils/normalize'
import { parseCSV } from '../../utils/csv'

/**
 * Extract the KEYWORD from a campaign title in format:
 * (INTENT) I KEYWORD I EXACT I SP I ASIN
 * e.g. (WATER) I water test strips I EXACT I SP I B0DV3ZG4
 */
export function extractKeywordFromExactTitle(title: string): string | null {
  if (!title || typeof title !== 'string') return null
  const s = title.trim()
  // Match ") I " then capture until " I EXACT"
  const match = s.match(/\)\s*I\s+(.+?)\s+I\s+EXACT\s+/i)
  if (match && match[1]) return match[1].trim()
  return null
}

/** Find column index whose header contains "campaign" (case-insensitive) */
export function findCampaignNameColumn(headers: string[]): number {
  const lower = headers.map((h) => (h ?? '').trim().toLowerCase().replace(/^"+|"+$/g, ''))
  const idx = lower.findIndex((h) => h.includes('campaign'))
  return idx >= 0 ? idx : 0
}

/**
 * Parse Reference Exact CSV and return a Set of normalized keywords
 * that are already running as EXACT campaigns.
 */
export function parseReferenceExactCsv(csvText: string): Set<string> {
  const rows = parseCSV(csvText)
  if (rows.length === 0) return new Set()
  const headers = rows[0].map((h) => (h ?? '').trim())
  const colIndex = findCampaignNameColumn(headers)
  const set = new Set<string>()
  for (let i = 1; i < rows.length; i++) {
    const cell = (rows[i][colIndex] ?? '').trim().replace(/^"+|"+$/g, '')
    const keyword = extractKeywordFromExactTitle(cell)
    if (keyword) {
      const norm = normalize(keyword)
      if (norm) set.add(norm)
    }
  }
  return set
}
