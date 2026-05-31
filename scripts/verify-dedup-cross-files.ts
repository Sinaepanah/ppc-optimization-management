/**
 * Run: npx tsx scripts/verify-dedup-cross-files.ts
 *
 * Validates dedup with May 31 SB search-term samples (1 file, 2 files merged).
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseCSV, resolveTermColumnForFile, findSearchTermReportHeaderRow } from '../src/utils/csv.ts'
import {
  buildCampaignFromSearchTermRows,
  findWithinFileDuplicates,
} from '../src/utils/deduplication.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const downloads = 'c:/Users/sinae/Downloads'
const f1Path = join(downloads, 'Sponsored_Brands_campaign_search_terms_May_31_2026.csv')
const f2Path = join(downloads, 'Sponsored_Brands_campaign_search_terms_May_31_2026 (1).csv')

assert.ok(existsSync(f1Path), `missing ${f1Path}`)
assert.ok(existsSync(f2Path), `missing ${f2Path}`)

function loadCampaign(name: string, path: string, refHeader: string[], refCol: number) {
  const rows = parseCSV(readFileSync(path, 'utf8'))
  const termCol = resolveTermColumnForFile(rows, refHeader, refCol)
  return { id: name, name, ...buildCampaignFromSearchTermRows(rows, termCol) }
}

const rows1 = parseCSV(readFileSync(f1Path, 'utf8'))
const hr1 = findSearchTermReportHeaderRow(rows1)
const refHeader = rows1[hr1] ?? rows1[0] ?? []
const refCol = 0

const c1 = loadCampaign('Sponsored_Brands_campaign_search_terms_May_31_2026', f1Path, refHeader, refCol)
const c2 = loadCampaign('Sponsored_Brands_campaign_search_terms_May_31_2026 (1)', f2Path, refHeader, refCol)

assert.ok(c1.terms.length > 200, 'file1 term count')
assert.ok(c2.terms.length > 100, 'file2 term count')

const single = findWithinFileDuplicates([c1], 2)
assert.ok(single.length >= 8, `single-file dups (got ${single.length})`)
const kidneySingle = single.find((d) => d.normalizedTerm === 'kidney support for man')
assert.ok(kidneySingle, 'kidney single-file dup')
assert.equal(kidneySingle!.totalClicks, 51)
assert.equal(kidneySingle!.clicksByCampaign.get('function test'), 50)
assert.equal(kidneySingle!.clicksByCampaign.get('lievr function test'), 1)

const merged = findWithinFileDuplicates([c1, c2], 2)
assert.ok(merged.length >= 11, `two-file merged dups (got ${merged.length})`)
const kidneyMerged = merged.find((d) => d.normalizedTerm === 'kidney support for man')
assert.ok(kidneyMerged, 'kidney merged dup')
assert.equal(kidneyMerged!.totalClicks, 51)
assert.equal(kidneyMerged!.clicksByCampaign.get('function test'), 50)

const urinalysis = merged.find((d) => d.normalizedTerm === 'urinalysis')
assert.ok(urinalysis, 'urinalysis merged dup across keywords from both files')
assert.equal(urinalysis!.totalClicks, 4)
assert.ok(urinalysis!.clicksByCampaign.get('lievr function test')! > 0)
assert.ok(urinalysis!.clicksByCampaign.get('liver test strips')! > 0)

console.log('verify-dedup-cross-files: OK')
