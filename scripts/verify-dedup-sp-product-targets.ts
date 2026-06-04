/**
 * Run: npx tsx scripts/verify-dedup-sp-product-targets.ts
 *
 * SP Manual Product Targeting: Matched product = term, Product targets = breakdown.
 * Same logic as keyword dedup; validates single-file, cross-file merge, and GBP columns.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  parseCSV,
  detectSearchTermColumn,
  detectMatchTargetColumn,
  detectSpendColumn,
  detectAttributedSalesColumn,
  findSearchTermReportHeaderRow,
  resolveTermColumnForFile,
} from '../src/utils/csv.ts'
import {
  buildCampaignFromSearchTermRows,
  findWithinFileDuplicates,
  withinFileMatchLabels,
} from '../src/utils/deduplication.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixtures = join(__dirname, '../test-fixtures')

function loadCampaign(name: string, fileName: string, refHeader: string[], refCol: number) {
  const rows = parseCSV(readFileSync(join(fixtures, fileName), 'utf8'))
  const termCol = resolveTermColumnForFile(rows, refHeader, refCol)
  return { id: name, name, ...buildCampaignFromSearchTermRows(rows, termCol) }
}

// --- Single file (within-file) ---
const withinRows = parseCSV(readFileSync(join(fixtures, 'sp-product-targets-within-file.csv'), 'utf8'))
const withinHr = findSearchTermReportHeaderRow(withinRows)
const withinHeaders = withinRows[withinHr] ?? []
assert.equal(detectSearchTermColumn(withinHeaders), 1, 'term col = Matched product')
assert.equal(detectMatchTargetColumn(withinHeaders), 2, 'target col = Product targets')
assert.ok(detectSpendColumn(withinHeaders) >= 0, 'GBP spend column')
assert.ok(detectAttributedSalesColumn(withinHeaders) >= 0, 'GBP sales column')

const withinBuilt = buildCampaignFromSearchTermRows(withinRows, detectSearchTermColumn(withinHeaders))
assert.equal(withinBuilt.matchTargetKind, 'product-targets')
assert.equal(withinBuilt.normalizedToClicks.get('b09svtd5f3'), 43)
assert.equal(withinBuilt.normalizedToSpend.get('b09svtd5f3'), 14.76 + 22.75)
assert.equal(withinBuilt.normalizedToAttributedSales.get('b09svtd5f3'), 43.31 + 55.0)
assert.ok(withinBuilt.termMatchBreakdown?.get('b09svtd5f3')?.size === 2, 'two product targets')

const withinCampaign = { id: 'sp-within', name: 'SP within', ...withinBuilt }
const withinDups = findWithinFileDuplicates([withinCampaign], 2)
assert.equal(withinDups.length, 1, 'one duplicate term')
assert.equal(withinDups[0]!.normalizedTerm, 'b09svtd5f3')
assert.equal(withinDups[0]!.campaignCount, 2)
assert.equal(withinDups[0]!.totalClicks, 43)
assert.equal(withinDups[0]!.clicksByCampaign.get('asin="B0BSQS9MSS"'), 18)
assert.equal(withinDups[0]!.clicksByCampaign.get('asin-expanded="B0BSQS9MSS"'), 25)

const labels = withinFileMatchLabels('product-targets')
assert.equal(labels.plural, 'product targets')
assert.equal(labels.singular, 'Product target')

// --- Cross-file merge (same as keyword multi-file) ---
const crossA = parseCSV(readFileSync(join(fixtures, 'sp-product-targets-cross-a.csv'), 'utf8'))
const crossHr = findSearchTermReportHeaderRow(crossA)
const refHeader = crossA[crossHr] ?? crossA[0] ?? []
const refCol = detectSearchTermColumn(refHeader)

const cA = loadCampaign('sp-cross-a', 'sp-product-targets-cross-a.csv', refHeader, refCol)
const cB = loadCampaign('sp-cross-b', 'sp-product-targets-cross-b.csv', refHeader, refCol)

const merged = findWithinFileDuplicates([cA, cB], 2)
assert.equal(merged.length, 2, 'two merged duplicate terms')

const b09 = merged.find((d) => d.normalizedTerm === 'b09svtd5f3')
assert.ok(b09, 'b09svtd5f3 merged across files')
assert.equal(b09!.totalClicks, 43)
assert.equal(b09!.clicksByCampaign.get('asin="B0BSQS9MSS"'), 18)
assert.equal(b09!.clicksByCampaign.get('asin-expanded="B0BSQS9MSS"'), 25)

const kidney = merged.find((d) => d.normalizedTerm === 'kidney test kit at home')
assert.ok(kidney, 'kidney merged across files')
assert.equal(kidney!.totalClicks, 5)
assert.equal(kidney!.clicksByCampaign.get('asin="B0BSQS9MSS"'), 3)
assert.equal(kidney!.clicksByCampaign.get('asin-expanded="B0BSQS9MSS"'), 2)

// ACOS from combined spend / sales
const totalSpend = [...b09!.spendByCampaign.values()].reduce((a, b) => a + b, 0)
const totalSales = [...b09!.attributedSalesByCampaign.values()].reduce((a, b) => a + b, 0)
assert.ok(totalSpend > 0 && totalSales > 0)
assert.ok(b09!.totalAcosPct != null && b09!.totalAcosPct > 0)

// Repeated CSV rows: same Matched product + same Product targets (Amazon export duplicate lines)
const dupRowRows = parseCSV(readFileSync(join(fixtures, 'sp-product-targets-duplicate-rows.csv'), 'utf8'))
const dupRowBuilt = buildCampaignFromSearchTermRows(dupRowRows, detectSearchTermColumn(dupRowRows[0] ?? []))
assert.ok(dupRowBuilt.termMatchBreakdown?.get('b09svtd5f3')?.size === 2, 'duplicate rows → two breakdown keys')
assert.equal(dupRowBuilt.normalizedToClicks.get('b09svtd5f3'), 1136)
const dupRowDups = findWithinFileDuplicates([{ id: 'dup-rows', name: 'dup rows', ...dupRowBuilt }], 2)
assert.equal(dupRowDups.length, 1)
assert.equal(dupRowDups[0]!.normalizedTerm, 'b09svtd5f3')
assert.equal(dupRowDups[0]!.totalClicks, 1136)
assert.equal(dupRowDups[0]!.clicksByCampaign.get('asin-expanded="B0BSQS9MSS"'), 18)
assert.equal(dupRowDups[0]!.clicksByCampaign.get('asin-expanded="B0BSQS9MSS" (row 2)'), 1118)

console.log('verify-dedup-sp-product-targets: OK (within-file + cross-file + GBP + duplicate rows + product-target labels)')
