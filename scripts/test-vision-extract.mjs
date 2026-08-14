/**
 * Smoke-test Exact Bid Tools vision extract against local server.
 * Usage: node scripts/test-vision-extract.mjs [path-to-image.png] [adLevel|placement]
 */
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const mode = process.argv[3] || 'adLevel'
const imagePath = process.argv[2]

async function makeSyntheticPng() {
  // Minimal valid 1x1 PNG — only for connectivity; real accuracy needs a real screenshot
  const b64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC'
  const dir = join(root, 'tmp')
  await mkdir(dir, { recursive: true })
  const path = join(dir, 'synthetic-ppc.png')
  await writeFile(path, Buffer.from(b64, 'base64'))
  return path
}

const path = imagePath || (await makeSyntheticPng())
const buf = await readFile(path)
const imageBase64 = buf.toString('base64')
const mimeType = path.toLowerCase().endsWith('.jpg') || path.toLowerCase().endsWith('.jpeg') ? 'image/jpeg' : 'image/png'

const resp = await fetch('http://localhost:3001/api/ppc/extract-screenshot', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ imageBase64, mimeType, mode }),
})
const text = await resp.text()
console.log('status', resp.status)
console.log(text)
