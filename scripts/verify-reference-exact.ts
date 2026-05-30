/**
 * Run: npx tsx scripts/verify-reference-exact.ts
 */
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  extractKeywordFromExactTitle,
  lookupReferenceMetrics,
  parseReferenceExactCsvWithMetrics,
  REFERENCE_TARGETING_PLACEHOLDER_ASIN,
  referenceCompositeKey,
} from '../src/autoExact/utils/referenceExact.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Campaign-title format (existing)
const campaignTitleCsv = readFileSync(
  join(__dirname, '../test-fixtures/reference-exact-campaign-title.csv'),
  'utf8'
)
const campaignResult = parseReferenceExactCsvWithMetrics(campaignTitleCsv)
assert.equal(campaignResult.referenceFormat, 'campaign-title')
assert.equal(campaignResult.campaignRowCount, 2)
assert.equal(campaignResult.keywords.size, 2)
assert.ok(campaignResult.normalizedTermsInReference.has('pool test strips'))
assert.ok(campaignResult.normalizedTermsInReference.has('pool test kit'))

const stripsKey = referenceCompositeKey('pool test strips', 'B0G4HV1QDP')
const stripsMetrics = campaignResult.metricsByKeyword.get(stripsKey)
assert.ok(stripsMetrics)
assert.equal(stripsMetrics!.orders, 2)
assert.equal(stripsMetrics!.spend, 20)
assert.equal(stripsMetrics!.sales, 100)

// Targeting export format (new)
const targetingCsv = readFileSync(
  join(__dirname, '../test-fixtures/reference-exact-targeting-export.csv'),
  'utf8'
)
const targetingResult = parseReferenceExactCsvWithMetrics(targetingCsv)
assert.equal(targetingResult.referenceFormat, 'targeting-export')
assert.equal(targetingResult.campaignRowCount, 3, 'BROAD row should be excluded')
assert.equal(targetingResult.keywords.size, 3)
assert.ok(!targetingResult.normalizedTermsInReference.has('broad pool term'))

const poolStripsKey = referenceCompositeKey('pool test strips', REFERENCE_TARGETING_PLACEHOLDER_ASIN)
const poolStrips = targetingResult.metricsByKeyword.get(poolStripsKey)
assert.ok(poolStrips)
assert.equal(poolStrips!.clicks, 161)
assert.equal(poolStrips!.orders, 12)
assert.equal(poolStrips!.spend, 287.88)

// lookupReferenceMetrics: placeholder fallback without Export ASIN
const lookedUp = lookupReferenceMetrics(targetingResult.metricsByKeyword, 'pool test kit', null)
assert.ok(lookedUp)
assert.equal(lookedUp!.clicks, 155)

// Campaign title parser takes priority when both could apply (not realistic, but title rows win)
assert.equal(extractKeywordFromExactTitle('(POOL) I pool test strips I EXACT I SP I B0G4HV1QDP'), 'pool test strips')

// User file (optional)
const userPath = 'c:/Users/sinae/Downloads/Sponsored_Brands_targeting_May_30_2026.csv'
if (existsSync(userPath)) {
  const userResult = parseReferenceExactCsvWithMetrics(readFileSync(userPath, 'utf8'))
  assert.equal(userResult.referenceFormat, 'targeting-export')
  assert.ok(userResult.campaignRowCount >= 5)
  assert.ok(userResult.normalizedTermsInReference.has('pool test strips'))
  console.log(`user targeting CSV: ${userResult.campaignRowCount} EXACT keywords`)
}

console.log('verify-reference-exact: OK (campaign-title + targeting-export)')
