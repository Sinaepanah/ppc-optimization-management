import express from 'express'
import cors from 'cors'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { extractPpcFromScreenshot } from './ppcVisionExtract.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data')
const CAMPAIGNS_FILE = join(DATA_DIR, 'campaigns.json')
const PROFILES_FILE = join(DATA_DIR, 'profiles.json')
const ACTIVE_PROFILE_FILE = join(DATA_DIR, 'activeProfileId.json')

/** Load KEY=VALUE from a .env file into process.env if not already set. */
async function loadEnvFile(filePath) {
  try {
    const text = await readFile(filePath, 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq <= 0) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (key && process.env[key] === undefined) process.env[key] = value
    }
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
  }
}

await loadEnvFile(join(__dirname, '.env'))
await loadEnvFile(join(__dirname, '..', '.env'))

const app = express()
app.use(cors())
app.use(express.json({ limit: '20mb' }))

async function ensureDataDir() {
  try {
    await mkdir(DATA_DIR, { recursive: true })
  } catch (e) {
    if (e.code !== 'EEXIST') throw e
  }
}

async function readJson(path, defaultValue) {
  try {
    const raw = await readFile(path, 'utf8')
    return raw ? JSON.parse(raw) : defaultValue
  } catch (e) {
    if (e.code === 'ENOENT') return defaultValue
    throw e
  }
}

async function writeJson(path, value) {
  await writeFile(path, JSON.stringify(value), 'utf8')
}

app.get('/api/campaigns', async (_req, res) => {
  try {
    await ensureDataDir()
    const raw = await readJson(CAMPAIGNS_FILE, [])
    res.json(Array.isArray(raw) ? raw : [])
  } catch (e) {
    console.error('GET /api/campaigns', e)
    res.status(500).json({ error: String(e.message) })
  }
})

app.put('/api/campaigns', async (req, res) => {
  try {
    await ensureDataDir()
    const body = Array.isArray(req.body) ? req.body : []
    await writeJson(CAMPAIGNS_FILE, body)
    res.json(body)
  } catch (e) {
    console.error('PUT /api/campaigns', e)
    res.status(500).json({ error: String(e.message) })
  }
})

// Topic profiles (allowed / excluded topics for Relevancy Filter tab). Persisted for sync when VITE_API_URL points at this server.
app.get('/api/profiles', async (_req, res) => {
  try {
    await ensureDataDir()
    const data = await readJson(PROFILES_FILE, [])
    res.json(Array.isArray(data) ? data : [])
  } catch (e) {
    console.error('GET /api/profiles', e)
    res.status(500).json({ error: String(e.message) })
  }
})

app.put('/api/profiles', async (req, res) => {
  try {
    await ensureDataDir()
    const body = Array.isArray(req.body) ? req.body : []
    await writeJson(PROFILES_FILE, body)
    res.json(body)
  } catch (e) {
    console.error('PUT /api/profiles', e)
    res.status(500).json({ error: String(e.message) })
  }
})

app.get('/api/active-profile-id', async (_req, res) => {
  try {
    await ensureDataDir()
    const data = await readJson(ACTIVE_PROFILE_FILE, null)
    res.json(data == null ? null : data)
  } catch (e) {
    console.error('GET /api/active-profile-id', e)
    res.status(500).json({ error: String(e.message) })
  }
})

app.put('/api/active-profile-id', async (req, res) => {
  try {
    await ensureDataDir()
    const id = req.body === null || req.body === undefined ? null : req.body
    await writeJson(ACTIVE_PROFILE_FILE, id)
    res.json(id)
  } catch (e) {
    console.error('PUT /api/active-profile-id', e)
    res.status(500).json({ error: String(e.message) })
  }
})

app.post('/api/acos/recommendation', async (req, res) => {
  try {
    const { currentCpc, currentAcos, targetAcos, clicks, orders, asp, topOfSearchClicks, topOfSearchOrders, placementAwareEnabled } = req.body ?? {}

    const cpc = Number(currentCpc)
    const current = Number(currentAcos)
    const target = Number(targetAcos)
    const clicksNum = Number(clicks)
    const ordersNum = Number(orders)
    const aspNum = Number(asp)

    if (!Number.isFinite(cpc) || cpc <= 0) {
      return res.status(400).json({ error: 'Current CPC must be greater than 0.' })
    }
    if (!Number.isFinite(current) || current <= 0) {
      return res.status(400).json({ error: 'Current ACOS must be greater than 0.' })
    }
    if (!Number.isFinite(target) || target <= 0) {
      return res.status(400).json({ error: 'Target ACOS must be greater than 0.' })
    }
    if (!Number.isFinite(clicksNum) || clicksNum <= 0) {
      return res.status(400).json({ error: 'Clicks must be greater than 0.' })
    }
    if (!Number.isFinite(ordersNum) || ordersNum < 0) {
      return res.status(400).json({ error: 'Orders must be 0 or greater.' })
    }
    if (ordersNum > clicksNum) {
      return res.status(400).json({ error: 'Orders cannot exceed Clicks.' })
    }
    if (!Number.isFinite(aspNum) || aspNum <= 0) {
      return res.status(400).json({ error: 'Average Selling Price must be greater than 0.' })
    }

    const blendedCvr = ordersNum / clicksNum
    let cvr = blendedCvr
    let placementAdvantage = false
    if (placementAwareEnabled) {
      const topClicks = Number(topOfSearchClicks) || 0
      const topOrders = Number(topOfSearchOrders) || 0
      const topCvr = topClicks > 0 ? topOrders / topClicks : 0
      placementAdvantage = topCvr > blendedCvr && blendedCvr > 0
      if (placementAdvantage) {
        const cvrLift = Math.min(topCvr / blendedCvr, 2.0)
        cvr = blendedCvr * (0.5 + 0.5 * cvrLift)
      }
    }
    const maxCpcValue = (target / 100) * aspNum * cvr
    const cpcAcosAdjusted = cpc * (target / current)
    const suggestedCore = Math.min(maxCpcValue, cpcAcosAdjusted)

    let confidenceFactor
    if (clicksNum < 10) confidenceFactor = 0.2
    else if (clicksNum < 30) confidenceFactor = 0.5
    else if (clicksNum < 60) confidenceFactor = 0.75
    else confidenceFactor = 1.0

    const suggestedAfterConfidence = cpc * (1 - confidenceFactor) + suggestedCore * confidenceFactor

    const acosRatio = target > 0 ? current / target : 1
    let maxDecrease
    if (acosRatio >= 5) maxDecrease = 0.6
    else if (acosRatio >= 3) maxDecrease = 0.5
    else if (acosRatio >= 2) maxDecrease = 0.4
    else maxDecrease = 0.3
    const capBaseline = cpc
    const lowerBound = capBaseline * (1 - maxDecrease)
    const upperBound = capBaseline * 1.25

    let suggestedBidFinal = suggestedAfterConfidence
    let capStatus = 'none'
    if (suggestedAfterConfidence < lowerBound) {
      suggestedBidFinal = lowerBound
      capStatus = 'decrease'
    } else if (suggestedAfterConfidence > upperBound) {
      suggestedBidFinal = upperBound
      capStatus = 'increase'
    }

    let status, recommendedBaseAdjustment, recommendedPlacementAction
    if (acosRatio <= 0.7) {
      status = 'Profitable & Scalable'
      recommendedBaseAdjustment = placementAdvantage ? '+15%' : '+10%'
      recommendedPlacementAction = placementAdvantage ? 'Increase Top-of-Search multiplier' : 'Monitor marginal ACOS'
    } else if (acosRatio <= 1.2) {
      status = 'Stable'
      recommendedBaseAdjustment = '±10% max'
      recommendedPlacementAction = placementAdvantage ? 'Shift exposure toward Top-of-Search' : 'Maintain bid'
    } else if (acosRatio <= 2) {
      status = 'Weak'
      recommendedBaseAdjustment = placementAdvantage ? '-15% to -30%' : '-30%'
      recommendedPlacementAction = placementAdvantage ? 'Increase profitable placement exposure cautiously' : 'Reduce base bid'
    } else {
      status = 'Losing'
      recommendedBaseAdjustment = placementAdvantage ? '-30% to -40%' : '-40% to -60%'
      recommendedPlacementAction = placementAdvantage ? 'Increase profitable placement multiplier, reduce base bid' : 'Reduce bid significantly'
    }
    const confidenceLevel = clicksNum < 10 ? 'Low' : clicksNum < 30 ? 'Medium' : clicksNum < 60 ? 'High' : 'Full'

    res.json({
      cvr: Math.round(cvr * 10000) / 10000,
      maxCpcValue: Math.round(maxCpcValue * 100) / 100,
      cpcAcosAdjusted: Math.round(cpcAcosAdjusted * 100) / 100,
      suggestedCore: Math.round(suggestedCore * 100) / 100,
      suggestedBidFinal: Math.round(suggestedBidFinal * 100) / 100,
      capStatus,
      status,
      placementAdvantage,
      recommendedBaseAdjustment,
      recommendedPlacementAction,
      confidenceLevel,
    })
  } catch (e) {
    console.error('POST /api/acos/recommendation', e)
    res.status(500).json({ error: String(e.message) })
  }
})

/** Exact Bid Tools: screenshot → ad-level / placement JSON via OpenAI vision */
app.post('/api/ppc/extract-screenshot', async (req, res) => {
  try {
    const { imageBase64, mimeType, mode } = req.body ?? {}
    const data = await extractPpcFromScreenshot({
      imageBase64,
      mimeType: mimeType || 'image/png',
      mode,
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_VISION_MODEL,
    })
    res.json({ ok: true, mode, data })
  } catch (e) {
    console.error('POST /api/ppc/extract-screenshot', e)
    const status = Number.isInteger(e.status) ? e.status : 500
    res.status(status).json({ error: String(e.message || e) })
  }
})

const PORT = process.env.PORT || 3001
await ensureDataDir()
app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`)
  if (!process.env.OPENAI_API_KEY) {
    console.warn('OPENAI_API_KEY not set — Exact Bid Tools screenshot extract will return 503')
  }
})
