import express from 'express'
import cors from 'cors'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data')
const CAMPAIGNS_FILE = join(DATA_DIR, 'campaigns.json')
const PROFILES_FILE = join(DATA_DIR, 'profiles.json')
const ACTIVE_PROFILE_FILE = join(DATA_DIR, 'activeProfileId.json')

const app = express()
app.use(cors())
app.use(express.json({ limit: '10mb' }))

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
    const { clicks, orders, sellingPrice, profitPerUnit, targetAcosPct } = req.body ?? {}

    const clicksNum = Number(clicks)
    const ordersNum = Number(orders)
    const sellingPriceNum = Number(sellingPrice)
    const profitPerUnitNum = Number(profitPerUnit)
    const targetNum = Number(targetAcosPct)

    if (!Number.isFinite(clicksNum) || clicksNum <= 0) {
      return res.status(400).json({ error: 'Clicks must be greater than 0.' })
    }
    if (!Number.isFinite(ordersNum) || ordersNum < 0) {
      return res.status(400).json({ error: 'Orders must be 0 or greater.' })
    }
    if (ordersNum > clicksNum) {
      return res.status(400).json({ error: 'Orders cannot exceed Clicks.' })
    }
    if (!Number.isFinite(sellingPriceNum) || sellingPriceNum <= 0) {
      return res.status(400).json({ error: 'Selling Price must be greater than 0.' })
    }
    if (!Number.isFinite(profitPerUnitNum) || profitPerUnitNum <= 0) {
      return res.status(400).json({ error: 'Profit Per Unit must be greater than 0.' })
    }
    if (!Number.isFinite(targetNum) || targetNum <= 0) {
      return res.status(400).json({ error: 'Target ACOS must be greater than 0.' })
    }

    const cvr = ordersNum / clicksNum
    const maxCpcAcos = (targetNum / 100) * sellingPriceNum * cvr
    const maxCpcProfit = profitPerUnitNum * cvr
    let suggestedBid = Math.min(maxCpcAcos, maxCpcProfit)
    const lowDataApplied = clicksNum < 20
    if (lowDataApplied) suggestedBid *= 0.7

    res.json({
      cvr: Math.round(cvr * 10000) / 10000,
      maxCpcAcos: Math.round(maxCpcAcos * 100) / 100,
      maxCpcProfit: Math.round(maxCpcProfit * 100) / 100,
      suggestedBid: Math.round(suggestedBid * 100) / 100,
      lowDataApplied,
    })
  } catch (e) {
    console.error('POST /api/acos/recommendation', e)
    res.status(500).json({ error: String(e.message) })
  }
})

const PORT = process.env.PORT || 3001
await ensureDataDir()
app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`)
})
