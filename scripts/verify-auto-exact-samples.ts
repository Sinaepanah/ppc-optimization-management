/**
 * Run: npx tsx scripts/verify-auto-exact-samples.ts
 *
 * Validates Input data + Reference Exact CSV compatibility for Amazon export variants.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { normalizeSearchTermReportRows, parseCSV } from '../src/utils/csv.ts'
import { getHeaderSuggestions, getRequiredMissing, parseRow, rowToRaw } from '../src/autoExact/utils/csvHelpers.ts'
import { parseReferenceExactCsvWithMetrics } from '../src/autoExact/utils/referenceExact.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const downloads = 'c:/Users/sinae/Downloads'

function loadCsv(path: string): string[][] {
  assert.ok(existsSync(path), `missing sample: ${path}`)
  return parseCSV(readFileSync(path, 'utf8'))
}

function assertInputReady(label: string, rows: string[][]) {
  const normalized = normalizeSearchTermReportRows(rows)
  const mapping = getHeaderSuggestions(normalized)
  const missing = getRequiredMissing(mapping)
  assert.equal(missing.length, 0, `${label}: missing required columns: ${missing.join(', ')}`)
  assert.ok(mapping.searchTerm >= 0, `${label}: search term column`)
  assert.ok(normalized.length > 1, `${label}: needs header + data rows`)
}

function assertReferenceReady(label: string, csvText: string, minRows: number) {
  const result = parseReferenceExactCsvWithMetrics(csvText)
  assert.ok(result.campaignRowCount >= minRows, `${label}: expected >= ${minRows} reference rows`)
  assert.ok(result.keywords.size >= minRows, `${label}: expected keywords`)
}

// --- Input data samples ---

assertInputReady(
  'SP search term (Apr — Total cost + Sales)',
  loadCsv(join(downloads, 'Sponsored_Products_SearchTerm_Apr_12_2026.csv'))
)

assertInputReady(
  'SP search term (May — Clicks/CPC/ACOS/ROAS only)',
  loadCsv(join(downloads, 'Sponsored_Products_SearchTerm_May_18_2026.csv'))
)

const spMayRows = normalizeSearchTermReportRows(
  loadCsv(join(downloads, 'Sponsored_Products_SearchTerm_May_18_2026.csv'))
)
const spMayMapping = getHeaderSuggestions(spMayRows)
const spMayParsed = parseRow(rowToRaw(spMayRows[1]!), spMayMapping)
assert.ok(spMayParsed, 'SP May row parses')
assert.ok(spMayParsed!.spend > 0, 'SP May spend derived from Clicks × CPC')
assert.equal(spMayParsed!.spend, 13 * 2.13)

assertInputReady(
  'SB campaign search terms (preamble fixture)',
  loadCsv(join(__dirname, '../test-fixtures/sb-campaign-search-terms-preamble.csv'))
)

const sbRows = normalizeSearchTermReportRows(
  loadCsv(join(__dirname, '../test-fixtures/sb-campaign-search-terms-preamble.csv'))
)
const sbMapping = getHeaderSuggestions(sbRows)
assert.ok(sbMapping.spend >= 0, 'SB search terms maps Spend')
assert.ok(sbMapping.sales >= 0, 'SB search terms maps 14 Day Total Sales')
assert.ok(sbMapping.orders >= 0, 'SB search terms maps orders')

// --- Reference Exact samples ---

assertReferenceReady(
  'SB targeting export',
  readFileSync(join(downloads, 'Sponsored_Brands_targeting_May_30_2026.csv'), 'utf8'),
  15
)
const targeting = parseReferenceExactCsvWithMetrics(
  readFileSync(join(downloads, 'Sponsored_Brands_targeting_May_30_2026.csv'), 'utf8')
)
assert.equal(targeting.referenceFormat, 'targeting-export')

assertReferenceReady(
  'Campaign export (exact titles)',
  readFileSync(join(downloads, 'Campaign_May_30_2026.csv'), 'utf8'),
  100
)
const campaign = parseReferenceExactCsvWithMetrics(
  readFileSync(join(downloads, 'Campaign_May_30_2026.csv'), 'utf8')
)
assert.equal(campaign.referenceFormat, 'campaign-title')
assert.ok(campaign.normalizedTermsInReference.has('pool water testing kit'))

console.log('verify-auto-exact-samples: OK')
