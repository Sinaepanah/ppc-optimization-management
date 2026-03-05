import { parseCSV } from '../../utils/csv'

/**
 * Extract ASIN from campaign title. Uses CONTAINS logic: find any B0 ASIN in the title.
 * Supports formats like (INTENT) I KEYWORD I EXACT I SP I B0DV3ZG4N2
 */
export function extractAsinFromExactTitle(title: string): string | null {
  if (!title || typeof title !== 'string') return null
  const s = title.trim()
  // Match B0 followed by 8-9 alphanumeric (Amazon ASIN) - take last occurrence (product ASIN at end)
  const matches = [...s.matchAll(/\b(B0[A-Z0-9]{8,9})\b/gi)]
  if (matches.length > 0) return matches[matches.length - 1][1].toUpperCase()
  return null
}

/** Find column index - prefer more specific matches first (e.g. "campaign name" over "campaign") */
export function findColumnByHeader(headers: string[], ...keywords: string[]): number {
  const lower = headers.map((h) => (h ?? '').trim().toLowerCase().replace(/^"+|"+$/g, ''))
  for (const kw of keywords) {
    const idx = lower.findIndex((h) => h.includes(kw.toLowerCase()))
    if (idx >= 0) return idx
  }
  return -1
}

/** Prefer "Campaign name" for title - it's the actual campaign title column in Amazon exports */
function findCampaignNameColumn(headers: string[]): number {
  return findColumnByHeader(headers, 'campaign name', 'campaign', 'title')
}

export interface AsinRow {
  asin: string
  title: string
  rowIndex: number
  raw: Record<string, string>
}

export interface AsinAggregate {
  asin: string
  rowCount: number
  metrics: Record<string, number>
  rawRows: AsinRow[]
}

/**
 * Parse Reference Exact CSV and return rows with extracted ASIN and all columns.
 */
export function parseExactCsvWithAsin(csvText: string): { headers: string[]; rows: AsinRow[] } {
  // Strip BOM if present (common in Excel exports)
  const text = csvText.charCodeAt(0) === 0xfeff ? csvText.slice(1) : csvText
  const rows = parseCSV(text)
  if (rows.length === 0) return { headers: [], rows: [] }

  const headers = rows[0].map((h) => (h ?? '').trim().replace(/^"+|"+$/g, ''))
  const campaignCol = findCampaignNameColumn(headers)
  if (campaignCol < 0) return { headers, rows: [] }

  const result: AsinRow[] = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const title = (row[campaignCol] ?? '').trim().replace(/^"+|"+$/g, '')
    const asin = extractAsinFromExactTitle(title)
    if (!asin) continue

    const raw: Record<string, string> = {}
    headers.forEach((h, idx) => {
      raw[h] = (row[idx] ?? '').trim().replace(/^"+|"+$/g, '')
    })
    result.push({ asin, title, rowIndex: i + 1, raw })
  }
  return { headers, rows: result }
}

function parseNum(val: string): number {
  if (val == null || val === '') return 0
  // Remove $ % and thousand separators (comma, space)
  const cleaned = String(val).replace(/[$,%\s]/g, '')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

/**
 * Aggregate rows by ASIN, summing all columns that parse as numbers.
 */
export function aggregateByAsin(rows: AsinRow[], headers: string[]): AsinAggregate[] {
  const byAsin = new Map<string, AsinAggregate>()

  for (const row of rows) {
    let agg = byAsin.get(row.asin)
    if (!agg) {
      agg = {
        asin: row.asin,
        rowCount: 0,
        metrics: {},
        rawRows: [],
      }
      byAsin.set(row.asin, agg)
    }
    agg.rowCount++
    agg.rawRows.push(row)

    // Sum every column that parses as a number (ensures we don't miss Impressions etc.)
    headers.forEach((h) => {
      const num = parseNum(row.raw[h])
      agg!.metrics[h] = (agg!.metrics[h] ?? 0) + num
    })
  }

  return Array.from(byAsin.values()).sort((a, b) => a.asin.localeCompare(b.asin))
}

/** Get headers that look like numeric metrics (for pie chart selection) */
export function getNumericMetricHeaders(headers: string[]): string[] {
  const numericPatterns = [
    'purchase',
    'order',
    'click',
    'impression',
    'spend',
    'cost',
    'sale',
    'cpc',
    'acos',
    'ctr',
    'conversion',
  ]
  return headers.filter((h) => {
    const l = h.toLowerCase()
    return numericPatterns.some((p) => l.includes(p))
  })
}
