/**
 * COMPREHENSIVE DEDUPLICATION AUDIT
 * Run: npx tsx scripts/verify-dedup-full-audit.ts
 *
 * Validates every dedup engine function AND replicates the exact UI filter/preset/sort
 * logic from DeduplicationPanel.tsx so the whole feature is proven end-to-end.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseCSV, detectAcosColumn, detectRoasColumn } from '../src/utils/csv.ts'
import {
  buildCampaignFromSearchTermRows,
  buildCampaignFromTerms,
  findCrossCampaignDuplicates,
  findCrossBatchDuplicates,
  findWithinFileDuplicates,
  findSingleSheetDuplicatesByCampaign,
  normalizeExactTerm,
  withinFileMatchLabels,
  campaignsHaveMatchBreakdown,
} from '../src/utils/deduplication.ts'
import type { Campaign, DuplicateResult } from '../src/types.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixtures = join(__dirname, '../test-fixtures')

let passed = 0
function check(label: string, cond: boolean) {
  assert.ok(cond, label)
  passed++
}

function camp(id: string, name: string, rows: string[][], termCol: number, bundleName?: string): Campaign {
  const built = buildCampaignFromSearchTermRows(rows, termCol)
  return { id, name, ...(bundleName ? { bundleName } : {}), ...built }
}

// ---------------------------------------------------------------------------
// Replicated UI logic (mirrors DeduplicationPanel.tsx exactly)
// ---------------------------------------------------------------------------
function parseOptionalNonNegNumber(s: string): number | undefined {
  const t = s.trim().replace(/,/g, '')
  if (!t) return undefined
  const n = parseFloat(t)
  if (!Number.isFinite(n) || n < 0) return undefined
  return n
}
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
  minClicks?: number, maxClicks?: number,
  minPurch?: number, maxPurch?: number,
  minAcosPct?: number, maxAcosPct?: number
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
interface Preset { minClicks: string; maxClicks: string; minPurch: string; maxPurch: string; minAcos: string; maxAcos: string; zeroSalesOnly: boolean }
function applyPreset(results: DuplicateResult[], p: Preset): DuplicateResult[] {
  const minClicks = parseOptionalNonNegNumber(p.minClicks)
  const maxClicks = parseOptionalNonNegNumber(p.maxClicks)
  const minPurch = parseOptionalNonNegNumber(p.minPurch)
  const maxPurch = parseOptionalNonNegNumber(p.maxPurch)
  const minAcos = parseOptionalNonNegNumber(p.minAcos)
  const maxAcos = parseOptionalNonNegNumber(p.maxAcos)
  let list = results
  if ([minClicks, maxClicks, minPurch, maxPurch, minAcos, maxAcos].some((v) => v !== undefined)) {
    list = list.filter((r) => passesMetricThresholds(r, minClicks, maxClicks, minPurch, maxPurch, minAcos, maxAcos))
  }
  if (p.zeroSalesOnly) list = list.filter((r) => passesZeroSalesOnly(r))
  return list
}
// Presets as defined in DeduplicationPanel.tsx DEFAULT_METRIC_PRESETS
const PRESET_1: Preset = { minClicks: '', maxClicks: '', minPurch: '', maxPurch: '3', minAcos: '65', maxAcos: '', zeroSalesOnly: false }
const PRESET_2: Preset = { minClicks: '15', maxClicks: '', minPurch: '', maxPurch: '', minAcos: '', maxAcos: '', zeroSalesOnly: true }

type DupSortKey = 'term' | 'campaigns' | 'count' | 'totalClicks' | 'totalPurchases'
function compareDupRows(a: DuplicateResult, b: DuplicateResult, key: DupSortKey): number {
  let cmp = 0
  switch (key) {
    case 'term': cmp = a.normalizedTerm.localeCompare(b.normalizedTerm, undefined, { sensitivity: 'base' }); break
    case 'campaigns': cmp = a.campaigns.join('\u0001').localeCompare(b.campaigns.join('\u0001'), undefined, { sensitivity: 'base' }); break
    case 'count': cmp = a.campaignCount - b.campaignCount; break
    case 'totalClicks': cmp = a.totalClicks - b.totalClicks; break
    case 'totalPurchases': cmp = a.totalPurchases - b.totalPurchases; break
  }
  if (cmp === 0) cmp = a.normalizedTerm.localeCompare(b.normalizedTerm, undefined, { sensitivity: 'base' })
  return cmp
}
function sortRows(rows: DuplicateResult[], key: DupSortKey, dir: 'asc' | 'desc'): DuplicateResult[] {
  const mul = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => mul * compareDupRows(a, b, key))
}

// ===========================================================================
// SECTION 1: As-is (cross-campaign) dedup + ACOS from spend/sales
// ===========================================================================
{
  const rows = parseCSV(readFileSync(join(fixtures, '../public/test-campaign.csv'), 'utf8'))
  const a = camp('a', 'File A', rows, 1)
  const b = camp('b', 'File B', rows, 1)
  const cross = findCrossCampaignDuplicates([a, b], 2)
  check('as-is: 3 shared terms', cross.length === 3)
  const wtk = cross.find((d) => d.normalizedTerm === 'water testing kit')!
  check('as-is: appears in 2 campaigns', wtk.campaignCount === 2)
  check('as-is: clicks summed 10+10=20', wtk.totalClicks === 20)
  check('as-is: purchases summed 3+3=6', wtk.totalPurchases === 6)
  // spend 50+50=100, sales 200+200=400 => ACOS 25%
  check('as-is: blended ACOS = 25%', Math.abs((wtk.totalAcosPct ?? 0) - 25) < 1e-9)
  check('as-is: per-campaign ACOS present', wtk.acosPctByCampaign.get('File A') != null)
  // maxCampaigns bound
  const bounded = findCrossCampaignDuplicates([a, b], 2, 1)
  check('as-is: max<min yields none', bounded.length === 0)
}

// ===========================================================================
// SECTION 2: Batch mode (aggregate per bundle) + ACOS from batch totals
// ===========================================================================
{
  const rows = parseCSV(readFileSync(join(fixtures, '../public/test-campaign.csv'), 'utf8'))
  const a = camp('a', 'A', rows, 1, 'BatchOne')
  const b = camp('b', 'B', rows, 1, 'BatchOne')
  const c = camp('c', 'C', rows, 1, 'BatchTwo')
  const batch = findCrossBatchDuplicates([a, b, c], 2)
  check('batch: terms present across 2 batches', batch.length === 3)
  const wtk = batch.find((d) => d.normalizedTerm === 'water testing kit')!
  check('batch: 2 batches', wtk.campaignCount === 2)
  // BatchOne aggregates A+B: clicks 20, BatchTwo C: clicks 10 => total 30
  check('batch: BatchOne clicks aggregated 10+10=20', wtk.clicksByCampaign.get('BatchOne') === 20)
  check('batch: BatchTwo clicks 10', wtk.clicksByCampaign.get('BatchTwo') === 10)
  check('batch: total clicks 30', wtk.totalClicks === 30)
  // spend BatchOne 100 sales 400; BatchTwo spend 50 sales 200 => total spend150 sales600 ACOS 25%
  check('batch: blended ACOS = 25%', Math.abs((wtk.totalAcosPct ?? 0) - 25) < 1e-9)
}

// ===========================================================================
// SECTION 3: Within-file + non-duplicate mode (real sales => ACOS)
// ===========================================================================
{
  const rows = parseCSV(readFileSync(join(fixtures, 'sp-product-targets-within-file.csv'), 'utf8'))
  const c = camp('sp', 'SP', rows, 1)
  check('within: matchTargetKind product-targets', c.matchTargetKind === 'product-targets')
  check('within: hasMatchBreakdown', campaignsHaveMatchBreakdown([c]))
  const dups = findWithinFileDuplicates([c], 2)
  const b09 = dups.find((d) => d.normalizedTerm === 'b09svtd5f3')!
  check('within: b09 has 2 targets', b09.campaignCount === 2)
  check('within: b09 clicks 43', b09.totalClicks === 43)
  check('within: b09 purchases 3', b09.totalPurchases === 3)
  // spend 14.76+22.75=37.51 sales 43.31+55=98.31 => ACOS ~38.15%
  check('within: b09 blended ACOS computed', b09.totalAcosPct != null && b09.totalAcosPct > 0)
  const perAcos = [...b09.acosPctByCampaign.values()].filter((v) => v != null)
  check('within: per-target ACOS both present', perAcos.length === 2)

  // Non-duplicate mode (min=1,max=1): only single-target terms
  const nonDup = findWithinFileDuplicates([c], 1, 1)
  check('non-dup: every term exactly 1 target', nonDup.every((d) => d.campaignCount === 1))
  check('non-dup: excludes multi-target b09', !nonDup.some((d) => d.normalizedTerm === 'b09svtd5f3'))

  // Labels
  const labels = withinFileMatchLabels('product-targets')
  check('labels: plural product targets', labels.plural === 'product targets')
  check('labels: combined line', labels.combined === 'All product targets combined')
  const kw = withinFileMatchLabels('keywords')
  check('labels: keywords singular', kw.singular === 'Matched keyword')
}

// ===========================================================================
// SECTION 4: Metric filters (clicks/orders/ACOS/zero-sales) exhaustive
// ===========================================================================
{
  const data = [
    ['Customer search term', 'Keywords', 'Clicks', 'Purchases', 'Total cost (USD)', 'Sales (USD)'],
    ['alpha', 'kw1', '30', '0', '10.00', '0'],     // zero sales, zero orders
    ['alpha', 'kw2', '5', '0', '2.00', '0'],
    ['beta', 'kw3', '40', '2', '80.00', '100.00'], // 2 orders, ACOS 80%
    ['beta', 'kw4', '10', '0', '0', '0'],
    ['gamma', 'kw5', '12', '1', '5.00', '100.00'], // 1 order, ACOS 5%
    ['gamma', 'kw6', '8', '0', '0', '0'],
  ]
  const c = camp('m', 'M', data, 0)
  const dups = findWithinFileDuplicates([c], 2)
  const alpha = dups.find((d) => d.normalizedTerm === 'alpha')!
  const beta = dups.find((d) => d.normalizedTerm === 'beta')!
  const gamma = dups.find((d) => d.normalizedTerm === 'gamma')!

  check('filter: alpha totalClicks 35', alpha.totalClicks === 35)
  check('filter: alpha zero sales & orders', passesZeroSalesOnly(alpha))
  check('filter: beta NOT zero sales (has orders+sales)', !passesZeroSalesOnly(beta))
  check('filter: gamma NOT zero sales', !passesZeroSalesOnly(gamma))

  // min clicks 15 => alpha(35), beta(50), gamma(20) all pass
  check('filter: minClicks 15 keeps all 3', dups.filter((r) => passesMetricThresholds(r, 15)).length === 3)
  // max clicks 20 => only gamma(20)
  check('filter: maxClicks 20 keeps gamma', dups.filter((r) => passesMetricThresholds(r, undefined, 20)).map((r) => r.normalizedTerm).join() === 'gamma')
  // min orders 1 => beta, gamma
  check('filter: minPurch 1 keeps beta+gamma', dups.filter((r) => passesMetricThresholds(r, undefined, undefined, 1)).length === 2)
  // max orders 0 => alpha only
  check('filter: maxPurch 0 keeps alpha', dups.filter((r) => passesMetricThresholds(r, undefined, undefined, undefined, 0)).map((r) => r.normalizedTerm).join() === 'alpha')
  // ACOS >= 65 => beta (80%) only; alpha has no ACOS (null) so excluded
  const highAcos = dups.filter((r) => passesMetricThresholds(r, undefined, undefined, undefined, undefined, 65))
  check('filter: minACOS 65 keeps beta only', highAcos.map((r) => r.normalizedTerm).join() === 'beta')
  check('filter: minACOS excludes null-ACOS alpha', !highAcos.some((r) => r.normalizedTerm === 'alpha'))
  // ACOS <= 10 => gamma (5%) only
  const lowAcos = dups.filter((r) => passesMetricThresholds(r, undefined, undefined, undefined, undefined, undefined, 10))
  check('filter: maxACOS 10 keeps gamma only', lowAcos.map((r) => r.normalizedTerm).join() === 'gamma')
  // zero sales only => alpha only
  check('filter: zeroSalesOnly keeps alpha only', dups.filter(passesZeroSalesOnly).map((r) => r.normalizedTerm).join() === 'alpha')
}

// ===========================================================================
// SECTION 5: Preset 1 & Preset 2 exact conditions
// ===========================================================================
{
  const data = [
    ['Customer search term', 'Keywords', 'Clicks', 'Purchases', 'Total cost (USD)', 'Sales (USD)'],
    // p2 target: >=15 clicks, zero sales+orders
    ['zerosale', 'k1', '20', '0', '5.00', '0'],
    ['zerosale', 'k2', '10', '0', '2.00', '0'],
    // fails p2 (has order)
    ['hasorder', 'k3', '30', '1', '5.00', '50.00'],
    ['hasorder', 'k4', '5', '0', '0', '0'],
    // fails p2 (too few clicks) but zero sales
    ['lowclick', 'k5', '5', '0', '1.00', '0'],
    ['lowclick', 'k6', '4', '0', '1.00', '0'],
    // p1 target: <=3 orders, ACOS>=65
    ['p1hit', 'k7', '25', '2', '90.00', '100.00'], // ACOS 90
    ['p1hit', 'k8', '5', '1', '10.00', '20.00'],   // combined ACOS = 100/120=83.3%, orders 3
  ]
  const c = camp('p', 'P', data, 0)
  const dups = findWithinFileDuplicates([c], 2)

  // Preset 2: minClicks 15 + zeroSalesOnly
  const p2 = applyPreset(dups, PRESET_2)
  check('PRESET 2: keeps only zerosale', p2.length === 1 && p2[0]!.normalizedTerm === 'zerosale')
  check('PRESET 2: excludes hasorder (2 purch)', !p2.some((r) => r.normalizedTerm === 'hasorder'))
  check('PRESET 2: excludes lowclick (<15 clicks)', !p2.some((r) => r.normalizedTerm === 'lowclick'))

  // Preset 1: maxPurch 3 + minAcos 65
  const p1 = applyPreset(dups, PRESET_1)
  check('PRESET 1: keeps p1hit (3 orders, ACOS>=65)', p1.some((r) => r.normalizedTerm === 'p1hit'))
  check('PRESET 1: excludes zerosale (no ACOS)', !p1.some((r) => r.normalizedTerm === 'zerosale'))
  const p1hit = dups.find((d) => d.normalizedTerm === 'p1hit')!
  check('PRESET 1: p1hit orders <=3', p1hit.totalPurchases <= 3)
  check('PRESET 1: p1hit ACOS >=65', (p1hit.totalAcosPct ?? 0) >= 65)
}

// ===========================================================================
// SECTION 6: Sorting comparators (all keys, both directions)
// ===========================================================================
{
  const rows = parseCSV(readFileSync(join(fixtures, '../public/test-campaign.csv'), 'utf8'))
  const a = camp('a', 'A', rows, 1)
  const b = camp('b', 'B', rows, 1)
  const cross = findCrossCampaignDuplicates([a, b], 2)
  const byClicksDesc = sortRows(cross, 'totalClicks', 'desc')
  check('sort: clicks desc first is highest', byClicksDesc[0]!.totalClicks >= byClicksDesc[byClicksDesc.length - 1]!.totalClicks)
  const byClicksAsc = sortRows(cross, 'totalClicks', 'asc')
  check('sort: clicks asc first is lowest', byClicksAsc[0]!.totalClicks <= byClicksAsc[byClicksAsc.length - 1]!.totalClicks)
  const byTermAsc = sortRows(cross, 'term', 'asc')
  check('sort: term asc alphabetical', byTermAsc[0]!.normalizedTerm <= byTermAsc[1]!.normalizedTerm)
  const byPurchDesc = sortRows(cross, 'totalPurchases', 'desc')
  check('sort: purchases desc', byPurchDesc[0]!.totalPurchases >= byPurchDesc[byPurchDesc.length - 1]!.totalPurchases)
}

// ===========================================================================
// SECTION 7: Single-sheet drain finder
// ===========================================================================
{
  const single =
    'Campaign name,Customer Search Term,Impressions,Clicks,Spend,Sales,Purchases\n' +
    'Camp A,shared term,100,10,5,50,1\n' +
    'Camp B,shared term,200,20,10,0,0\n' +
    'Camp A,solo term,50,5,2,20,1\n'
  const res = findSingleSheetDuplicatesByCampaign(single, 2, 0)
  check('single-sheet: 1 term across 2 campaigns', res.length === 1)
  check('single-sheet: term is shared term', res[0]!.normalizedTerm === 'shared term')
  check('single-sheet: 2 campaigns', res[0]!.campaignCount === 2)
  check('single-sheet: combined clicks 30', res[0]!.totalClicks === 30)
  check('single-sheet: per-campaign clicks A=10', res[0]!.clicksByCampaign.get('Camp A') === 10)
  check('single-sheet: impressions summed 300', res[0]!.totalImpressions === 300)
  check('single-sheet: orders A=1 B=0', res[0]!.purchasesByCampaign.get('Camp A') === 1 && res[0]!.purchasesByCampaign.get('Camp B') === 0)
  // combined clicks threshold
  const filtered = findSingleSheetDuplicatesByCampaign(single, 2, 100)
  check('single-sheet: min combined clicks 100 filters out', filtered.length === 0)
}

// ===========================================================================
// SECTION 7b: Report ACOS fallback (Spend/Sales all 0, ACOS/ROAS present)
// ===========================================================================
{
  const rows = parseCSV(readFileSync(join(fixtures, 'sb-report-acos-no-spend.csv'), 'utf8'))
  const c = camp('sb', 'SB', rows, 0)
  const dups = findWithinFileDuplicates([c], 2)
  const salt = dups.find((d) => d.normalizedTerm === 'saltwater aquarium accessories')!
  check('reportACOS: term found', !!salt)
  // ACOS must show from report column even though spend & sales are 0
  const fish = salt.acosPctByCampaign.get('fish tank water test kit')
  const reef = salt.acosPctByCampaign.get('reef tank water test kit')
  check('reportACOS: fish keyword ACOS ~18.34', fish != null && Math.abs(fish - 18.34279535009462) < 1e-6)
  check('reportACOS: reef keyword ACOS ~38.44', reef != null && Math.abs(reef - 38.44282238442822) < 1e-6)
  // zero-order keyword has no report ACOS -> null
  check('reportACOS: zero-order keyword ACOS null', salt.acosPctByCampaign.get('saltwater aquarium test kit') == null)
  // combined = orders-weighted = (18.34*2 + 38.44*1)/3 = 25.04
  const expectedCombined = (18.34279535009462 * 2 + 38.44282238442822 * 1) / 3
  check('reportACOS: combined orders-weighted ~25.04', salt.totalAcosPct != null && Math.abs(salt.totalAcosPct - expectedCombined) < 1e-6)
  // still counts orders correctly
  check('reportACOS: total orders 3', salt.totalPurchases === 3)
  // NOT zero-sales (has orders)
  check('reportACOS: not zero-sales', !passesZeroSalesOnly(salt))
  // ACOS filters work on report ACOS: min 30 keeps none combined? salt combined 25.04 < 30 -> excluded
  check('reportACOS: minACOS 30 excludes salt (25.04)', !dups.filter((r) => passesMetricThresholds(r, undefined, undefined, undefined, undefined, 30)).some((r) => r.normalizedTerm === 'saltwater aquarium accessories'))
  check('reportACOS: minACOS 20 keeps salt (25.04)', dups.filter((r) => passesMetricThresholds(r, undefined, undefined, undefined, undefined, 20)).some((r) => r.normalizedTerm === 'saltwater aquarium accessories'))
}

// SECTION 7c: Report ACOS across As-is (cross-campaign) + Batch modes
{
  const rows = parseCSV(readFileSync(join(fixtures, 'sb-report-acos-no-spend.csv'), 'utf8'))
  const a = camp('a', 'File A', rows, 0)
  const b = camp('b', 'File B', rows, 0)
  const cross = findCrossCampaignDuplicates([a, b], 2)
  const salt = cross.find((d) => d.normalizedTerm === 'saltwater aquarium accessories')!
  check('reportACOS as-is: per-source ACOS present', salt.acosPctByCampaign.get('File A') != null)
  check('reportACOS as-is: combined ACOS present', salt.totalAcosPct != null && salt.totalAcosPct > 0)

  const ba = camp('ba', 'BA', rows, 0, 'B1')
  const bb = camp('bb', 'BB', rows, 0, 'B2')
  const batch = findCrossBatchDuplicates([ba, bb], 2)
  const saltB = batch.find((d) => d.normalizedTerm === 'saltwater aquarium accessories')!
  check('reportACOS batch: per-batch ACOS present', saltB.acosPctByCampaign.get('B1') != null)
  check('reportACOS batch: combined ACOS present', saltB.totalAcosPct != null && saltB.totalAcosPct > 0)
}

// ===========================================================================
// SECTION 8: Manual keywords source builder
// ===========================================================================
{
  const built = buildCampaignFromTerms(['Water Testing Kit', 'water testing kit', 'pool test'])
  check('manual: dedups normalized to 2 terms', built.terms.length === 2)
  check('manual: clicks default 0', built.normalizedToClicks.get('water testing kit') === 0)
  const manualCamp: Campaign = { id: 'man', name: 'MAN', ...built }
  const rows = parseCSV(readFileSync(join(fixtures, '../public/test-campaign.csv'), 'utf8'))
  const file = camp('f', 'F', rows, 1)
  const cross = findCrossCampaignDuplicates([file, manualCamp], 2)
  check('manual: overlaps file on water testing kit', cross.some((d) => d.normalizedTerm === 'water testing kit'))
}

// SECTION 8b: Exact-term normalization keeps punctuation variants distinct
{
  check('exactNorm: & preserved distinct', normalizeExactTerm('gh & kh test kit') === 'gh & kh test kit')
  check('exactNorm: plain unchanged', normalizeExactTerm('gh kh test kit') === 'gh kh test kit')
  check('exactNorm: case + spacing collapsed', normalizeExactTerm('  GH  KH   Test Kit ') === 'gh kh test kit')
  check('exactNorm: distinct from & variant', normalizeExactTerm('gh & kh test kit') !== normalizeExactTerm('gh kh test kit'))

  const data = [
    ['Customer search term', 'Keywords', 'Clicks', 'Purchases', 'Total cost (USD)', 'Sales (USD)'],
    ['gh kh test kit', 'aquarium hardness test kit', '15', '0', '0', '0'],
    ['gh & kh test kit', 'aquarium hardness test kit', '3', '0', '0', '0'],
  ]
  // Default (shared) normalize merges them -> one term, 18 clicks
  const merged = buildCampaignFromSearchTermRows(data, 0)
  check('sharedNorm merges & variant to 1 term', merged.terms.length === 1)
  check('sharedNorm merged clicks 18', merged.normalizedToClicks.get('gh kh test kit') === 18)
  // Exact normalize keeps them separate -> two terms, 15 and 3
  const exact = buildCampaignFromSearchTermRows(data, 0, normalizeExactTerm)
  check('exactNorm keeps 2 distinct terms', exact.terms.length === 2)
  check('exactNorm gh kh = 15', exact.normalizedToClicks.get('gh kh test kit') === 15)
  check('exactNorm gh & kh = 3', exact.normalizedToClicks.get('gh & kh test kit') === 3)
}

// SECTION 9: ACOS/ROAS column detection
{
  const headers = ['Customer search term', 'Keywords', 'Clicks', 'Spend(USD)', 'Orders', 'Sales(USD)', 'ACOS', 'ROAS']
  check('detect: ACOS column index 6', detectAcosColumn(headers) === 6)
  check('detect: ROAS column index 7', detectRoasColumn(headers) === 7)
  check('detect: no ACOS when absent', detectAcosColumn(['term', 'clicks', 'sales']) === -1)
}

console.log(`verify-dedup-full-audit: OK — ${passed} assertions passed`)
