/**
 * Live validate placement extract against the Amazon screenshot (no Total cost column).
 * Expect derived spend ≈ sales × ACOS for each row.
 */
import { readFile } from 'fs/promises'

const imagePath = process.argv[2]
if (!imagePath) {
  console.error('Usage: node scripts/validate-placement-amazon.mjs <image.png>')
  process.exit(1)
}

const buf = await readFile(imagePath)
const imageBase64 = buf.toString('base64')

const resp = await fetch('http://localhost:3001/api/ppc/extract-screenshot', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ imageBase64, mimeType: 'image/png', mode: 'placement' }),
})
const body = await resp.json()
if (!resp.ok) {
  console.error('FAIL status', resp.status, body)
  process.exit(1)
}

const d = body.data
function money(s) {
  return parseFloat(String(s || '').replace(/[$,]/g, '')) || NaN
}

const expectations = [
  ['topOfSearch', 108.97, 28.36, 0.97, 32],
  ['restOfSearch', 104.42, 48.23, 0.84, 60],
  ['productPages', 71.98, 106.34, 0.74, 103],
]

let failed = false
for (const [key, sales, acos, cpc, clicks] of expectations) {
  const row = d[key]
  const got = money(row.totalCost)
  const fromAcos = (sales * acos) / 100
  const fromCpc = clicks * cpc
  const ok =
    Number.isFinite(got) &&
    got > cpc + 0.05 && // must NOT equal CPC for multi-click rows
    (Math.abs(got - fromAcos) <= 0.75 || Math.abs(got - fromCpc) <= 0.75)

  console.log(key, {
    totalCost: row.totalCost,
    cpc: row.cpc,
    sales: row.sales,
    acos: row.acos,
    clicks: row.clicks,
    expectSpendApprox: fromAcos.toFixed(2),
    ok,
  })
  if (!ok) failed = true
  if (Math.abs(got - cpc) < 0.05) {
    console.error(`FAIL ${key}: totalCost still equals CPC`)
    failed = true
  }
}

if (failed) {
  console.error('VALIDATION_FAIL')
  console.error(JSON.stringify(d, null, 2))
  process.exit(1)
}
console.log('VALIDATION_PASS')
