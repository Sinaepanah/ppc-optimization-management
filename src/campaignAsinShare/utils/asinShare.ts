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

function normalizeHeader(header: string): string {
  return (header ?? '').trim().toLowerCase()
}

function isNumericMetricValue(raw: string): boolean {
  if (raw == null) return false
  const s = String(raw).trim()
  if (!s) return false
  if (/^[-–—]+$|^n\/?a$/i.test(s)) return true
  return /[-+]?\d/.test(s)
}

function isAcosHeader(h: string): boolean {
  const n = normalizeHeader(h)
  return /\bacos\b|advertising cost of sales/i.test(n)
}

function isRoasHeader(h: string): boolean {
  const n = normalizeHeader(h)
  return /\broas\b|return on ad spend/i.test(n)
}

function isCtrHeader(h: string): boolean {
  const n = normalizeHeader(h)
  return /\bctr\b|click.?through.?rate/i.test(n)
}

function isCpcHeader(h: string): boolean {
  const n = normalizeHeader(h)
  return /\bcpc\b|cost per click/i.test(n)
}

function isSpendHeader(h: string): boolean {
  const n = normalizeHeader(h)
  return /\b(total\s*)?(spend|cost)\b/i.test(n) && !isCpcHeader(n) && !isAcosHeader(n)
}

function isSalesHeader(h: string): boolean {
  const n = normalizeHeader(h)
  return /\bsales?\b/i.test(n) && !isAcosHeader(n)
}

function isClicksHeader(h: string): boolean {
  const n = normalizeHeader(h)
  return /\bclicks?\b/i.test(n) && !isCtrHeader(n) && !isCpcHeader(n)
}

function isImpressionsHeader(h: string): boolean {
  const n = normalizeHeader(h)
  return /\bimpressions?\b/i.test(n)
}

function isOrderHeader(h: string): boolean {
  const n = normalizeHeader(h)
  return /\bpurchases?\b|\borders?\b|\bunits?\s*ordered\b/i.test(n)
}

function isConversionRateHeader(h: string): boolean {
  const n = normalizeHeader(h)
  return /\bconversion\b|\bcvr\b/.test(n)
}

function pickPreferredHeader(headers: string[], predicate: (h: string) => boolean): string | null {
  const converted = headers.find((h) => predicate(h) && /\(converted\)/i.test(h))
  if (converted) return converted
  return headers.find(predicate) ?? null
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
  // Remove currency/percent symbols and common thousand separators.
  const cleaned = String(val).replace(/[$,%\s,]/g, '')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

function averageMetricFromRows(rows: AsinRow[], header: string, excludeZero = false): number | null {
  let sum = 0
  let count = 0
  for (const row of rows) {
    const v = parseNum(row.raw[header] ?? '')
    if (!Number.isFinite(v)) continue
    if (excludeZero && v <= 0) continue
    sum += v
    count += 1
  }
  if (count === 0) return null
  return sum / count
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

    // Start with additive metrics.
    headers.forEach((h) => {
      const raw = row.raw[h]
      if (!isNumericMetricValue(raw)) return
      if (isAcosHeader(h) || isRoasHeader(h) || isCtrHeader(h) || isCpcHeader(h) || isConversionRateHeader(h)) {
        return
      }
      const num = parseNum(raw)
      agg!.metrics[h] = (agg!.metrics[h] ?? 0) + num
    })
  }

  // Build logically derived/weighted rate metrics.
  for (const agg of byAsin.values()) {
    const spendHeader = pickPreferredHeader(headers, isSpendHeader)
    const salesHeader = pickPreferredHeader(headers, isSalesHeader)
    const clicksHeader = pickPreferredHeader(headers, isClicksHeader)
    const impressionsHeader = pickPreferredHeader(headers, isImpressionsHeader)
    const ordersHeader = pickPreferredHeader(headers, isOrderHeader)

    const totalSpend = spendHeader ? agg.metrics[spendHeader] ?? 0 : 0
    const totalSales = salesHeader ? agg.metrics[salesHeader] ?? 0 : 0
    const totalClicks = clicksHeader ? agg.metrics[clicksHeader] ?? 0 : 0
    const totalImpressions = impressionsHeader ? agg.metrics[impressionsHeader] ?? 0 : 0
    const totalOrders = ordersHeader ? agg.metrics[ordersHeader] ?? 0 : 0

    headers.forEach((h) => {
      if (isAcosHeader(h)) {
        // Match analyst expectations: ACOS displayed as row-average ACOS (excluding zeros) when available.
        // Fallback to weighted ACOS if no usable row-level ACOS values exist.
        const avgAcos = averageMetricFromRows(agg.rawRows, h, true)
        agg.metrics[h] = avgAcos != null ? avgAcos : totalSales > 0 ? totalSpend / totalSales : 0
      } else if (isRoasHeader(h)) {
        agg.metrics[h] = totalSpend > 0 ? totalSales / totalSpend : 0
      } else if (isCtrHeader(h)) {
        agg.metrics[h] = totalImpressions > 0 ? totalClicks / totalImpressions : 0
      } else if (isCpcHeader(h)) {
        agg.metrics[h] = totalClicks > 0 ? totalSpend / totalClicks : 0
      } else if (isConversionRateHeader(h)) {
        agg.metrics[h] = totalClicks > 0 ? totalOrders / totalClicks : 0
      }
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
    const looksNumericMetric = numericPatterns.some((p) => l.includes(p))
    if (!looksNumericMetric) return false
    return !/\bbudget\b/.test(l)
  })
}

/** Metrics appropriate for pie distribution (additive KPI volumes, not ratios). */
export function getPieMetricHeaders(headers: string[]): string[] {
  return getNumericMetricHeaders(headers).filter(
    (h) => !isAcosHeader(h) && !isRoasHeader(h) && !isCpcHeader(h) && !isCtrHeader(h) && !isConversionRateHeader(h)
  )
}

export function getMetricOptionLabel(header: string): string {
  if (isAcosHeader(header)) return `${header} (weighted from spend/sales)`
  if (isRoasHeader(header)) return `${header} (weighted from sales/spend)`
  if (isCpcHeader(header)) return `${header} (derived spend/clicks)`
  if (isCtrHeader(header)) return `${header} (derived clicks/impressions)`
  if (isConversionRateHeader(header)) return `${header} (derived orders/clicks)`
  return `${header} (sum)`
}

export function formatMetricValue(header: string, value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (isSpendHeader(header) || /sales/i.test(header)) {
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  if (isAcosHeader(header) || isCtrHeader(header) || isConversionRateHeader(header)) {
    const pct = value <= 1.5 ? value * 100 : value
    return `${pct.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
  }
  if (isRoasHeader(header) || isCpcHeader(header)) {
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  if (isClicksHeader(header) || isImpressionsHeader(header) || isOrderHeader(header)) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 0 })
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}
