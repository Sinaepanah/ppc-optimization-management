/**
 * Validation script: Run Auto→Exact algorithm on BROAD + EXACT CSVs
 * Uses same logic as the app. NO CHANGES to app code.
 * Run: node validate-auto-exact.cjs
 */

const fs = require('fs')
const path = require('path')

// ---- Normalize (from src/utils/normalize.ts) ----
const PUNCTUATION = /[.,;:!?()[\]{}"'/\\|@#$%^&*_+=<>~`]/g
const WHITESPACE = /\s+/g
function normalize(term) {
  if (typeof term !== 'string') return null
  let s = term.trim()
  if (s === '') return null
  s = s.toLowerCase()
  s = s.replace(/-/g, ' ')
  s = s.replace(PUNCTUATION, '')
  s = s.replace(WHITESPACE, ' ')
  s = s.trim()
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1).trim()
  if (s.startsWith("'") && s.endsWith("'")) s = s.slice(1, -1).trim()
  s = s.replace(WHITESPACE, ' ').trim()
  return s === '' ? null : s
}

// ---- Parse number (from csvHelpers) ----
function num(val) {
  let s = String(val ?? '').trim().replace(/^"+|"+$/g, '')
  if (!s) return 0
  s = s.replace(/^\uFEFF/, '')
  s = s.replace(/[$€£¥\s]/g, '')
  const hasComma = s.includes(',')
  const hasPeriod = s.includes('.')
  if (hasComma && !hasPeriod) s = s.replace(/,/g, '.')
  else if (hasComma && hasPeriod) {
    const lastComma = s.lastIndexOf(',')
    const lastPeriod = s.lastIndexOf('.')
    if (lastComma > lastPeriod) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (hasComma) s = s.replace(/,/g, '')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

// ---- Simple CSV parse ----
function parseCSV(text) {
  const raw = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const rows = []
  let current = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (inQuotes) {
      if (c === '"') {
        if (raw[i + 1] === '"') { cell += '"'; i++ }
        else inQuotes = false
      } else cell += c
      continue
    }
    if (c === '"') { inQuotes = true; continue }
    if (c === ',' || c === '\t') {
      current.push(cell)
      cell = ''
      continue
    }
    if (c === '\r' && raw[i + 1] === '\n') {
      i++
      current.push(cell)
      rows.push(current)
      current = []
      cell = ''
      continue
    }
    if (c === '\n' || c === '\r') {
      current.push(cell)
      rows.push(current)
      current = []
      cell = ''
      continue
    }
    cell += c
  }
  if (cell || current.length) {
    current.push(cell)
    rows.push(current)
  }
  return rows
}

// ---- BROAD CSV: Customer search term, Added as, Keywords, Clicks, Total cost (USD), Purchases, Sales (USD), ROAS, Target bid (USD)
const BROAD_MAPPING = { searchTerm: 0, spend: 4, sales: 6, orders: 5, clicks: 3 }

// ---- DEFAULT_CRITERIA ----
const CRITERIA = { minOrders: 2, minSales: 50, maxACoS: 35, minClicksEnabled: false, minCVREnabled: false }

// ---- Parse BROAD: one row per CSV row ----
function parseBroadOnePerRow(rows) {
  const result = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const term = (r[BROAD_MAPPING.searchTerm] ?? '').trim()
    if (!term) continue
    const norm = normalize(term)
    if (!norm) continue
    const spend = num(r[BROAD_MAPPING.spend])
    const sales = num(r[BROAD_MAPPING.sales])
    const orders = num(r[BROAD_MAPPING.orders])
    const clicks = num(r[BROAD_MAPPING.clicks])
    result.push({
      normalizedTerm: norm,
      originalTerm: term,
      spendSum: spend,
      salesSum: sales,
      ordersSum: orders,
      clicksSum: clicks,
      rowCount: 1,
    })
  }
  return result
}

// ---- Parse BROAD: aggregate by normalized term (sum metrics) ----
function parseBroadAggregated(rows) {
  const map = new Map()
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const term = (r[BROAD_MAPPING.searchTerm] ?? '').trim()
    if (!term) continue
    const norm = normalize(term)
    if (!norm) continue
    const spend = num(r[BROAD_MAPPING.spend])
    const sales = num(r[BROAD_MAPPING.sales])
    const orders = num(r[BROAD_MAPPING.orders])
    const clicks = num(r[BROAD_MAPPING.clicks])
    const existing = map.get(norm)
    if (existing) {
      existing.spendSum += spend
      existing.salesSum += sales
      existing.ordersSum += orders
      existing.clicksSum += clicks
      existing.rowCount += 1
    } else {
      map.set(norm, {
        normalizedTerm: norm,
        originalTerm: term,
        spendSum: spend,
        salesSum: sales,
        ordersSum: orders,
        clicksSum: clicks,
        rowCount: 1,
      })
    }
  }
  return Array.from(map.values())
}

// ---- Score term (from scoring.ts) ----
function scoreTerm(agg) {
  const acosPct = agg.salesSum > 0 ? (agg.spendSum / agg.salesSum) * 100 : 0
  const cvrPct = agg.clicksSum > 0 ? (agg.ordersSum / agg.clicksSum) * 100 : null
  let confidence = 0
  if (agg.ordersSum >= CRITERIA.minOrders) confidence += 2
  if (agg.salesSum >= CRITERIA.minSales) confidence += 2
  if (acosPct <= CRITERIA.maxACoS && CRITERIA.maxACoS > 0) confidence += 2
  let qualifies =
    agg.ordersSum >= CRITERIA.minOrders &&
    agg.salesSum >= CRITERIA.minSales &&
    (CRITERIA.maxACoS <= 0 || acosPct <= CRITERIA.maxACoS) &&
    (!CRITERIA.minClicksEnabled || agg.clicksSum >= 20) &&
    (!CRITERIA.minCVREnabled || (cvrPct != null && cvrPct >= 8))
  const acosWithin10 = CRITERIA.maxACoS > 0 && acosPct <= CRITERIA.maxACoS + 10 && acosPct > CRITERIA.maxACoS
  const ordersMinusOne = agg.ordersSum === CRITERIA.minOrders - 1 && agg.salesSum >= CRITERIA.minSales * 0.5
  const inReviewQueue = !qualifies && (acosWithin10 || ordersMinusOne)
  return { ...agg, acosPct, cvrPct, confidence, qualifies, inReviewQueue }
}

// ---- Reference EXACT: extract keyword from (INTENT) I KEYWORD I EXACT I SP I ASIN ----
function extractKeywordFromExactTitle(title) {
  if (!title || typeof title !== 'string') return null
  const s = title.trim()
  const match = s.match(/\)\s*I\s+(.+?)\s+I\s+EXACT\s+/i)
  if (match && match[1]) return match[1].trim()
  return null
}

function parseReferenceExact(rows) {
  const headers = (rows[0] ?? []).map((h) => (h ?? '').trim().toLowerCase())
  const colIndex = headers.findIndex((h) => h.includes('campaign')) >= 0
    ? headers.findIndex((h) => h.includes('campaign'))
    : 0
  const set = new Set()
  for (let i = 1; i < rows.length; i++) {
    const cell = (rows[i][colIndex] ?? '').trim().replace(/^"+|"+$/g, '')
    const keyword = extractKeywordFromExactTitle(cell)
    if (keyword) {
      const norm = normalize(keyword)
      if (norm) set.add(norm)
    }
  }
  return set
}

// ---- MAIN ----
const broadPath = path.join(process.env.USERPROFILE || '', 'Downloads', 'BROAD Sponsored_Products_SearchTerm_Mar_8_2026.csv')
const exactPath = path.join(process.env.USERPROFILE || '', 'Downloads', 'EXACT Campaign_Mar_8_2026.csv')

const broadText = fs.readFileSync(broadPath, 'utf8')
const exactText = fs.readFileSync(exactPath, 'utf8')

const broadRows = parseCSV(broadText)
const exactRows = parseCSV(exactText)

const aggregated = parseBroadOnePerRow(broadRows)
const scored = aggregated.map(scoreTerm)
const promoteList = scored.filter((s) => s.qualifies).sort((a, b) => b.confidence - a.confidence || b.salesSum - a.salesSum)
const reviewQueue = scored.filter((s) => s.inReviewQueue).sort((a, b) => b.salesSum - a.salesSum)
const referenceExact = parseReferenceExact(exactRows)

const promoteExcludingExact = promoteList.filter((r) => !referenceExact.has(r.normalizedTerm))

console.log('=== Auto→Exact Validation Report ===\n')
console.log('Criteria (default): minOrders=2, minSales=50, maxACoS=35%')
console.log('Aggregation: one row per CSV row (aggregateByTerm=false)\n')

console.log('--- PROMOTE TO EXACT (qualifying terms) ---')
console.log(`Total: ${promoteList.length} rows`)
promoteList.forEach((r, i) => {
  if (i < 30) {
    const inExact = referenceExact.has(r.normalizedTerm) ? ' [ALREADY IN EXACT]' : ''
    console.log(`  ${i + 1}. "${r.originalTerm}" | Orders: ${r.ordersSum} | Sales: $${r.salesSum.toFixed(2)} | Spend: $${r.spendSum.toFixed(2)} | ACoS: ${r.acosPct.toFixed(1)}%${inExact}`)
  }
})
if (promoteList.length > 30) console.log(`  ... and ${promoteList.length - 30} more`)

console.log('\n--- REFERENCE EXACT KEYWORDS (from EXACT campaign CSV) ---')
console.log(`Extracted ${referenceExact.size} unique normalized keywords`)
const exactArr = [...referenceExact].sort()
exactArr.slice(0, 40).forEach((k, i) => console.log(`  ${i + 1}. ${k}`))
if (exactArr.length > 40) console.log(`  ... and ${exactArr.length - 40} more`)

console.log('\n--- PROMOTE LIST AFTER EXCLUDING ALREADY-EXACT ---')
console.log(`Promote list: ${promoteList.length} rows`)
console.log(`After excluding keywords in Reference Exact: ${promoteExcludingExact.length} rows`)
promoteExcludingExact.slice(0, 25).forEach((r, i) => {
  console.log(`  ${i + 1}. "${r.originalTerm}" | Orders: ${r.ordersSum} | Sales: $${r.salesSum.toFixed(2)} | ACoS: ${r.acosPct.toFixed(1)}%`)
})

console.log('\n--- REVIEW QUEUE (borderline) ---')
console.log(`Total: ${reviewQueue.length} rows`)
reviewQueue.slice(0, 15).forEach((r, i) => {
  console.log(`  ${i + 1}. "${r.originalTerm}" | Orders: ${r.ordersSum} | Sales: $${r.salesSum.toFixed(2)} | ACoS: ${r.acosPct.toFixed(1)}%`)
})

console.log('\n=== End of validation ===')
