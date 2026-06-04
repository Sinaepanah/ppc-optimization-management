/**
 * Run: npx tsx scripts/verify-dedup-cross-files.ts
 *
 * Validates merged keyword-level dedup across two CSV uploads (SB search-term reports).
 * Uses in-repo fixtures; optionally also checks user Downloads samples when present.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  parseCSV,
  resolveTermColumnForFile,
  findSearchTermReportHeaderRow,
  detectSearchTermColumn,
} from '../src/utils/csv.ts'
import {
  buildCampaignFromSearchTermRows,
  findWithinFileDuplicates,
} from '../src/utils/deduplication.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixtures = join(__dirname, '../test-fixtures')

function loadCampaign(name: string, path: string, refHeader: string[], refCol: number) {
  const rows = parseCSV(readFileSync(path, 'utf8'))
  const termCol = resolveTermColumnForFile(rows, refHeader, refCol)
  return { id: name, name, ...buildCampaignFromSearchTermRows(rows, termCol) }
}

function runCrossFileRegression(c1: ReturnType<typeof loadCampaign>, c2: ReturnType<typeof loadCampaign>) {
  const merged = findWithinFileDuplicates([c1, c2], 2)
  assert.ok(merged.length >= 2, `two-file merged dups (got ${merged.length})`)

  const kidneyMerged = merged.find((d) => d.normalizedTerm === 'kidney support for man')
  assert.ok(kidneyMerged, 'kidney merged dup')
  assert.equal(kidneyMerged!.totalClicks, 51)
  assert.equal(kidneyMerged!.clicksByCampaign.get('function test'), 50)
  assert.equal(kidneyMerged!.clicksByCampaign.get('lievr function test'), 1)

  const urinalysis = merged.find((d) => d.normalizedTerm === 'urinalysis')
  assert.ok(urinalysis, 'urinalysis merged dup across keywords from both files')
  assert.equal(urinalysis!.totalClicks, 4)
  assert.ok(urinalysis!.clicksByCampaign.get('lievr function test')! > 0)
  assert.ok(urinalysis!.clicksByCampaign.get('liver test strips')! > 0)
}

// In-repo fixtures (always run)
const f1Path = join(fixtures, 'sb-search-terms-cross-a.csv')
const f2Path = join(fixtures, 'sb-search-terms-cross-b.csv')
const rows1 = parseCSV(readFileSync(f1Path, 'utf8'))
const hr1 = findSearchTermReportHeaderRow(rows1)
const refHeader = rows1[hr1] ?? rows1[0] ?? []
const refCol = detectSearchTermColumn(refHeader)

const c1 = loadCampaign('sb-cross-a', f1Path, refHeader, refCol)
const c2 = loadCampaign('sb-cross-b', f2Path, refHeader, refCol)
assert.equal(c1.matchTargetKind, 'keywords')
runCrossFileRegression(c1, c2)

// Optional: user Downloads samples when available
const downloads = 'c:/Users/sinae/Downloads'
const dl1 = join(downloads, 'Sponsored_Brands_campaign_search_terms_May_31_2026.csv')
const dl2 = join(downloads, 'Sponsored_Brands_campaign_search_terms_May_31_2026 (1).csv')
if (existsSync(dl1) && existsSync(dl2)) {
  const dlRows1 = parseCSV(readFileSync(dl1, 'utf8'))
  const dlHr = findSearchTermReportHeaderRow(dlRows1)
  const dlRef = dlRows1[dlHr] ?? dlRows1[0] ?? []
  const dlCol = 0
  const dlC1 = loadCampaign('dl-1', dl1, dlRef, dlCol)
  const dlC2 = loadCampaign('dl-2', dl2, dlRef, dlCol)
  const merged = findWithinFileDuplicates([dlC1, dlC2], 2)
  assert.ok(merged.length >= 11, `Downloads two-file merged dups (got ${merged.length})`)
}

console.log('verify-dedup-cross-files: OK')
