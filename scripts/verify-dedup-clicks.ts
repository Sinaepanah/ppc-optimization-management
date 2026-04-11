/**
 * Run: npx tsx scripts/verify-dedup-clicks.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseCSV, detectClicksColumn, detectDelimiter, findSearchTermReportHeaderRow } from '../src/utils/csv.ts'
import { buildCampaignFromSearchTermRows } from '../src/utils/deduplication.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixture = readFileSync(join(__dirname, '../test-fixtures/search-terms-preamble.csv'), 'utf8')
const rows = parseCSV(fixture)

const hr = findSearchTermReportHeaderRow(rows)
assert.equal(hr, 2, `expected header on row 2, got ${hr}`)

const headers = rows[hr]
const cc = detectClicksColumn(headers)
assert.ok(cc >= 0, 'clicks column found')
const h = headers.map((x) => x.trim().toLowerCase())
assert.ok(h[cc]?.includes('click'), 'resolved column is clicks')

const built = buildCampaignFromSearchTermRows(rows, 1)
const norm = 'aquarium water testing'
const clicks = built.normalizedToClicks.get(norm)
assert.equal(clicks, 42, `expected 42 clicks for "${norm}", got ${clicks}`)

const plain = readFileSync(join(__dirname, '../public/test-campaign.csv'), 'utf8')
const plainRows = parseCSV(plain)
assert.equal(findSearchTermReportHeaderRow(plainRows), 0)
const plainBuilt = buildCampaignFromSearchTermRows(plainRows, 1)
assert.equal(plainBuilt.normalizedToClicks.get('water testing kit'), 10)
assert.equal(plainBuilt.normalizedToClicks.get('pool water test'), 5)

// Ragged row: fewer cells than header; clicks column must not alias to last present cell
const raggedRows = [
  ['Campaign', 'Customer Search Term', 'Impressions', 'Clicks'],
  ['X', 'ragged term test', '10'], // missing trailing columns
]
const raggedBuilt = buildCampaignFromSearchTermRows(raggedRows, 1)
assert.equal(raggedBuilt.normalizedToClicks.get('ragged term test'), 0, 'short row: clicks missing, expect 0 not a wrong column')

const semi =
  'Campaign name;Customer Search Term;Impressions;Clicks\nMyCamp;semi term;500;77\n'
const semiRows = parseCSV(semi)
assert.equal(detectDelimiter(semi), ';')
assert.equal(buildCampaignFromSearchTermRows(semiRows, 1).normalizedToClicks.get('semi term'), 77)

console.log('verify-dedup-clicks: OK (preamble + plain + ragged + semicolon)')
