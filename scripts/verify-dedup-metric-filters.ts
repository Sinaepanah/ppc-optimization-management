/**
 * Run: npx tsx scripts/verify-dedup-metric-filters.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseCSV } from '../src/utils/csv.ts'
import { buildCampaignFromSearchTermRows, findWithinFileDuplicates } from '../src/utils/deduplication.ts'
import type { DuplicateResult } from '../src/types.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

function dupTotalAttributedSales(r: DuplicateResult): number {
  let sum = 0
  for (const v of r.attributedSalesByCampaign.values()) sum += v
  return sum
}

function passesZeroSalesOnly(r: DuplicateResult): boolean {
  return dupTotalAttributedSales(r) === 0 && r.totalPurchases === 0
}

function passesMetricThresholds(
  r: DuplicateResult,
  minClicks?: number,
  maxClicks?: number,
  minPurch?: number,
  maxPurch?: number,
  minAcosPct?: number,
  maxAcosPct?: number
): boolean {
  if (minClicks !== undefined && r.totalClicks < minClicks) return false
  if (maxClicks !== undefined && r.totalClicks > maxClicks) return false
  if (minPurch !== undefined && r.totalPurchases < minPurch) return false
  if (maxPurch !== undefined && r.totalPurchases > maxPurch) return false
  if (minAcosPct !== undefined || maxAcosPct !== undefined) {
    const acos = r.totalAcosPct
    if (acos == null) return false
    if (minAcosPct !== undefined && acos < minAcosPct) return false
    if (maxAcosPct !== undefined && acos > maxAcosPct) return false
  }
  return true
}

// ACOS from spend + sales in SP product-targets fixture
const spRows = parseCSV(readFileSync(join(__dirname, '../test-fixtures/sp-product-targets-within-file.csv'), 'utf8'))
const spBuilt = buildCampaignFromSearchTermRows(spRows, 1)
const spDups = findWithinFileDuplicates([{ id: 'sp', name: 'SP', ...spBuilt }], 2)
const b09 = spDups.find((d) => d.normalizedTerm === 'b09svtd5f3')
assert.ok(b09, 'b09 dup exists')
assert.equal(b09!.totalPurchases, 3)
assert.ok(b09!.totalAcosPct != null && b09!.totalAcosPct > 0, 'blended ACOS computed from spend/sales')
const acosVals = [...b09!.acosPctByCampaign.values()].filter((v) => v != null)
assert.ok(acosVals.length >= 2, 'per-keyword ACOS when sales > 0')

// Purchases but zero attributed sales — must NOT pass zero-sales filter
const withPurchNoSales = [
  ['Customer search term', 'Keywords', 'Clicks', 'Purchases', 'Total cost (USD)', 'Sales (USD)'],
  ['saltwater aquarium accessories', 'fish tank water test kit', '10', '2', '5.00', '0'],
  ['saltwater aquarium accessories', 'reef tank water test kit', '13', '1', '6.00', '0'],
  ['saltwater aquarium accessories', 'saltwater aquarium test kit', '2', '0', '1.00', '0'],
]
const b2 = buildCampaignFromSearchTermRows(withPurchNoSales, 0)
const d2 = findWithinFileDuplicates([{ id: 'y', name: 'y', ...b2 }], 2)[0]!
assert.equal(d2.totalPurchases, 3)
assert.equal(dupTotalAttributedSales(d2), 0)
assert.equal(passesZeroSalesOnly(d2), false, 'purchases > 0 must fail zero-sales filter')

// Preset 2 style: min 15 clicks + zero sales only
const preset2Rows = [
  ['Customer search term', 'Keywords', 'Clicks', 'Purchases', 'Total cost (USD)', 'Sales (USD)'],
  ['zero sales term', 'kw a', '20', '0', '5.00', '0'],
  ['zero sales term', 'kw b', '10', '0', '3.00', '0'],
  ['has sales term', 'kw c', '20', '1', '5.00', '50.00'],
  ['has sales term', 'kw d', '10', '0', '2.00', '0'],
]
const b3 = buildCampaignFromSearchTermRows(preset2Rows, 0)
const dups3 = findWithinFileDuplicates([{ id: 'z', name: 'z', ...b3 }], 2)
const filtered = dups3.filter(
  (r) => passesMetricThresholds(r, 15) && passesZeroSalesOnly(r)
)
assert.equal(filtered.length, 1)
assert.equal(filtered[0]!.normalizedTerm, 'zero sales term')

// Preset 1 style: max 3 orders, min 65% ACOS
const preset1Rows = [
  ['Customer search term', 'Keywords', 'Clicks', 'Purchases', 'Total cost (USD)', 'Sales (USD)'],
  ['high acos', 'kw1', '30', '1', '80.00', '100.00'],
  ['low acos', 'kw2', '30', '1', '10.00', '100.00'],
  ['high acos', 'kw3', '20', '1', '50.00', '50.00'],
]
const b4 = buildCampaignFromSearchTermRows(preset1Rows, 0)
const d4 = findWithinFileDuplicates([{ id: 'p1', name: 'p1', ...b4 }], 2)[0]!
assert.equal(d4.totalPurchases, 2)
assert.ok(d4.totalAcosPct != null && d4.totalAcosPct >= 65, 'blended ACOS ~80%')
const p1pass = passesMetricThresholds(d4, undefined, undefined, undefined, 3, 65)
assert.equal(p1pass, true, 'preset 1 thresholds')

console.log('verify-dedup-metric-filters: OK')
