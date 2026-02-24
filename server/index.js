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
    const { currentCpc, currentAcos, targetAcos } = req.body ?? {}

    const cpc = Number(currentCpc)
    const current = Number(currentAcos)
    const target = Number(targetAcos)

    if (!Number.isFinite(cpc) || !Number.isFinite(current) || !Number.isFinite(target)) {
      return res.status(400).json({ error: 'All inputs must be numbers.' })
    }
    if (cpc <= 0 || current <= 0 || target <= 0) {
      return res.status(400).json({ error: 'All inputs must be greater than zero.' })
    }

    const ratio = target / current
    const recommendedCpc = cpc * ratio
    const percentChange = ((recommendedCpc - cpc) / cpc) * 100

    res.json({
      recommendedCpc: Number(recommendedCpc.toFixed(4)),
      percentChange: Number(percentChange.toFixed(2)),
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
