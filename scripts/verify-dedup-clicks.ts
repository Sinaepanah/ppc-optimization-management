/**
 * Run: npx tsx scripts/verify-dedup-clicks.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseCSV, detectClicksColumn, detectDelimiter, findSearchTermReportHeaderRow } from '../src/utils/csv.ts'
import { buildCampaignFromSearchTermRows, findWithinFileDuplicates } from '../src/utils/deduplication.ts'

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
assert.equal(built.normalizedToPurchases.get(norm), 7, 'purchases from Purchases column')
assert.equal(built.normalizedToSpend.get(norm), 120, 'spend')
assert.equal(built.normalizedToAttributedSales.get(norm), 600, 'attributed sales for ACOS')

const plain = readFileSync(join(__dirname, '../public/test-campaign.csv'), 'utf8')
const plainRows = parseCSV(plain)
assert.equal(findSearchTermReportHeaderRow(plainRows), 0)
const plainBuilt = buildCampaignFromSearchTermRows(plainRows, 1)
assert.equal(plainBuilt.normalizedToClicks.get('water testing kit'), 10)
assert.equal(plainBuilt.normalizedToClicks.get('pool water test'), 5)
assert.equal(plainBuilt.normalizedToPurchases.get('water testing kit'), 3)

// Ragged row: fewer cells than header; clicks column must not alias to last present cell
const raggedRows = [
  ['Campaign', 'Customer Search Term', 'Impressions', 'Clicks'],
  ['X', 'ragged term test', '10'], // missing trailing columns
]
const raggedBuilt = buildCampaignFromSearchTermRows(raggedRows, 1)
assert.equal(raggedBuilt.normalizedToClicks.get('ragged term test'), 0, 'short row: clicks missing, expect 0 not a wrong column')

const semi =
  'Campaign name;Customer Search Term;Impressions;Clicks;Spend;Sales;Purchases\nMyCamp;semi term;500;77;40;200;5\n'
const semiRows = parseCSV(semi)
assert.equal(detectDelimiter(semi), ';')
const semiBuilt = buildCampaignFromSearchTermRows(semiRows, 1)
assert.equal(semiBuilt.normalizedToClicks.get('semi term'), 77)
assert.equal(semiBuilt.normalizedToPurchases.get('semi term'), 5)
assert.equal(semiBuilt.normalizedToSpend.get('semi term'), 40)
assert.equal(semiBuilt.normalizedToAttributedSales.get('semi term'), 200)

// Within-file duplicates: same customer search term, different Keywords column values
const withinFileRows = [
  ['Added as', 'Customer search term', 'Keywords', 'Clicks', 'Purchases', 'Total cost (USD)', 'Sales (USD)'],
  ['', 'saltwater test kit', 'saltwater test kit', '4', '0', '4.58', '0'],
  ['', 'saltwater test kit', 'salt water aquarium testing kit', '4', '0', '5.34', '0'],
  ['', 'saltwater test kit', 'saltwater test kit for aquarium', '3', '0', '6.35', '0'],
  ['', 'unique single row term', 'some keyword', '10', '1', '5', '50'],
]
const withinBuilt = buildCampaignFromSearchTermRows(withinFileRows, 1)
assert.equal(withinBuilt.normalizedToClicks.get('saltwater test kit'), 11)
assert.ok(withinBuilt.termMatchBreakdown?.get('saltwater test kit')?.size === 3)

const withinCampaign = {
  id: 'test-within',
  name: 'Test Within File',
  ...withinBuilt,
}
const withinDups = findWithinFileDuplicates([withinCampaign], 2)
assert.equal(withinDups.length, 1)
assert.equal(withinDups[0]!.normalizedTerm, 'saltwater test kit')
assert.equal(withinDups[0]!.campaignCount, 3)
assert.equal(withinDups[0]!.totalClicks, 11)
assert.equal(withinDups[0]!.clicksByCampaign.get('saltwater test kit'), 4)
assert.equal(withinDups[0]!.clicksByCampaign.get('salt water aquarium testing kit'), 4)

const noWithinDups = findWithinFileDuplicates([withinCampaign], 4)
assert.equal(noWithinDups.length, 0)

console.log('verify-dedup-clicks: OK (preamble + plain + ragged + semicolon + within-file)')
