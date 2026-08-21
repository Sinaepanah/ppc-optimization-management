/**
 * Live validate Bulk PPC screenshot vision extract (mode=bulkKeywords).
 * Usage: node scripts/validate-bulk-screenshot.mjs <image.png>
 */
import { readFile } from 'fs/promises'

const imagePath = process.argv[2]
if (!imagePath) {
  console.error('Usage: node scripts/validate-bulk-screenshot.mjs <image.png>')
  process.exit(1)
}

const buf = await readFile(imagePath)
const imageBase64 = buf.toString('base64')

const resp = await fetch('http://localhost:3001/api/ppc/extract-screenshot', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ imageBase64, mimeType: 'image/png', mode: 'bulkKeywords' }),
})
const body = await resp.json()
if (!resp.ok) {
  console.error('FAIL', resp.status, body)
  process.exit(1)
}

const keywords = body?.data?.keywords
if (!Array.isArray(keywords) || keywords.length < 1) {
  console.error('FAIL no keywords', body)
  process.exit(1)
}

let failed = false
for (const k of keywords) {
  const clicks = parseFloat(String(k.clicks || '').replace(/,/g, '')) || 0
  const cpc = parseFloat(String(k.cpc || '').replace(/[$,]/g, '')) || 0
  const spend = parseFloat(String(k.spend || '').replace(/[$,]/g, '')) || 0
  if (clicks > 1 && cpc > 0 && Math.abs(spend - cpc) < 0.05) {
    console.error('FAIL spend still equals CPC', k)
    failed = true
  }
  if (!k.keyword && !k.clicks) {
    console.error('FAIL empty row', k)
    failed = true
  }
  console.log('row', {
    keyword: k.keyword,
    bid: k.bid,
    clicks: k.clicks,
    cpc: k.cpc,
    spend: k.spend,
    sales: k.sales,
    acos: k.acos,
  })
}

// Expect at least the aquarium / water rows somehow represented
const blob = JSON.stringify(keywords).toLowerCase()
if (!blob.includes('aquarium') && !blob.includes('water') && !blob.includes('1.15') && !blob.includes('0.88')) {
  console.error('FAIL unexpected keyword content')
  failed = true
}

if (failed) {
  console.error('VALIDATION_FAIL')
  process.exit(1)
}
console.log('VALIDATION_PASS', { count: keywords.length })
