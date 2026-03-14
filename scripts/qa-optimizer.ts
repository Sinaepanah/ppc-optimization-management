/**
 * QA: Verify optimizer calculator output with provided CSVs.
 * Run: npx tsx scripts/qa-optimizer.ts
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { parsePlacementCsv } from '../src/ppcTool/utils/placementCsvParser'
import { parseAdLevelCsv } from '../src/ppcTool/utils/adLevelCsvParser'
import { optimize } from '../src/ppcTool/utils/optimizer'

const downloads = join(process.env.USERPROFILE || process.env.HOME || '', 'Downloads')
const placementCsv = readFileSync(join(downloads, 'Sponsored_Products_Placement_Mar_14_2026.csv'), 'utf8')
const targetCsv = readFileSync(join(downloads, 'Sponsored_Products_Target_Mar_14_2026.csv'), 'utf8')

const adLevel = parseAdLevelCsv(targetCsv)
const placement = parsePlacementCsv(placementCsv)
const targetAcos = 43.37

const result = optimize(adLevel, placement, targetAcos)

console.log('Layer 2 Product Pages:', JSON.stringify(result.layer2.productPages, null, 2))

const p = result.layer2.productPages
const ok = p.suggestedAdjustment === 25 && p.rationale.includes('near target')
if (ok) {
  console.log('\n✅ Calculator QA PASSED')
} else {
  console.log('\n❌ Calculator QA FAILED')
  process.exit(1)
}
