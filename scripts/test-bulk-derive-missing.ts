/**
 * Validate Bulk PPC derive-missing metrics (same rules as Exact Bid Tools).
 */
import { deriveMissingKeywordMetrics } from '../src/bulkPpc/utils/deriveMissingMetrics.ts'
import { parseKeywordCsv } from '../src/bulkPpc/utils/keywordCsvParser.ts'
import { optimizeBulk } from '../src/bulkPpc/utils/bulkOptimizer.ts'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg)
}

function money(s: string | undefined): number {
  return parseFloat(String(s || '').replace(/[$,]/g, '')) || NaN
}

function runOnce(pass: number) {
  // Case A: missing spend + sales — like Amazon crop with clicks, cpc, acos only for sales path
  const a = deriveMissingKeywordMetrics({
    clicks: '81',
    cpc: '1.31',
    purchases: undefined,
    spend: '',
    sales: '',
    acos: '35.72',
  })
  // Without sales, spend from clicks×cpc
  assert(a.spend === '106.11', `pass${pass} A spend ${a.spend}`)
  assert(a.sales === '297.06', `pass${pass} A sales ${a.sales}`)

  // Case B: missing spend, have sales+acos (prefer Sales×ACOS)
  const b = deriveMissingKeywordMetrics({
    clicks: '32',
    cpc: '0.97',
    spend: '',
    sales: '108.97',
    acos: '28.36',
  })
  assert(Math.abs(money(b.spend) - (108.97 * 28.36) / 100) < 0.02, `pass${pass} B spend`)

  // Case C: bogus spend = cpc with multi clicks
  const c = deriveMissingKeywordMetrics({
    clicks: '60',
    cpc: '0.84',
    spend: '0.84',
    sales: '104.42',
    acos: '48.23',
  })
  assert(Math.abs(money(c.spend) - (104.42 * 48.23) / 100) < 0.05, `pass${pass} C spend repaired ${c.spend}`)
  assert(c.cpc === '0.84', `pass${pass} C cpc kept`)

  // Case D: do not overwrite real spend
  const d = deriveMissingKeywordMetrics({
    clicks: '2',
    cpc: '1.31',
    spend: '9.99',
    sales: '50.00',
    acos: '20',
  })
  assert(d.spend === '9.99', `pass${pass} D keep spend`)

  // Case E: CSV parse path — no Spend column
  const csv = [
    'Keyword,Match Type,Bid,Impressions,Clicks,CPC,Orders,Sales,ACOS',
    'water tester,EXACT,0.88,98438,195,0.81,8,285.62,0.553',
  ].join('\n')
  const parsed = parseKeywordCsv(csv)
  assert(!parsed.parseError, parsed.parseError || 'parse ok')
  const row = parsed.rows[0]
  assert(!!row.spend && money(row.spend) > 1, `pass${pass} CSV derived spend ${row.spend}`)
  // 195 * 0.81 = 157.95 OR 285.62 * 55.3% — ACOS normalize: 0.553 → if n<10 *100 = 55.3
  const expectFromAcos = 285.62 * 0.553
  const expectFromCpc = 195 * 0.81
  const got = money(row.spend)
  assert(
    Math.abs(got - expectFromAcos) < 0.5 || Math.abs(got - expectFromCpc) < 0.5,
    `pass${pass} CSV spend ${got} not near ${expectFromAcos} or ${expectFromCpc}`
  )

  const opts = optimizeBulk(parsed.rows, 35)
  assert(opts.length === 1, `pass${pass} optimize count`)
  assert(opts[0].spend > 1, `pass${pass} optimize uses spend ${opts[0].spend}`)

  // CTR derive
  const e = deriveMissingKeywordMetrics({
    impressions: '1000',
    clicks: '10',
    ctr: '',
  })
  assert(e.ctr === '1', `pass${pass} CTR ${e.ctr}`)

  console.log(`PASS_${pass}`, { csvSpend: row.spend, optSpend: opts[0].spend, status: opts[0].status })
}

runOnce(1)
runOnce(2)
console.log('BULK_DERIVE_VALIDATION_OK')
