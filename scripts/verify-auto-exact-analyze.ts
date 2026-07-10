/**
 * Run: npx tsx scripts/verify-auto-exact-analyze.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { normalizeSearchTermReportRows, parseCSV } from '../src/utils/csv.ts'
import { getHeaderSuggestions, getRequiredMissing } from '../src/autoExact/utils/csvHelpers.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

const preambleCsv = readFileSync(join(__dirname, '../test-fixtures/search-terms-preamble.csv'), 'utf8')
const raw = parseCSV(preambleCsv)
assert.ok(raw.length >= 3, 'preamble fixture should have title + blank + header rows')

const normalized = normalizeSearchTermReportRows(raw)
assert.equal(normalized.length, raw.length - 2, 'should drop 2 preamble rows')
assert.match(normalized[0][0] ?? '', /campaign name/i, 'row 0 should be real header')

const mapping = getHeaderSuggestions(normalized)
assert.equal(getRequiredMissing(mapping).length, 0, 'all required columns should auto-map after preamble strip')
assert.ok(mapping.spend >= 0, 'spend column mapped')
assert.ok(mapping.sales >= 0, 'sales column mapped')
assert.ok(mapping.orders >= 0, 'orders column mapped')

console.log('verify-auto-exact-analyze: OK')
