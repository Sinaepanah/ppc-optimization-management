/**
 * Parse ad-level PPC data from Amazon Campaign Manager screenshots.
 * Uses Tesseract TSV for precise word positions and column alignment.
 */

export interface ExtractedAdLevelData {
  bid?: string
  impressions?: string
  clicks?: string
  totalCost?: string
  cpc?: string
  purchases?: string
  sales?: string
  acos?: string
}

interface TsvWord {
  left: number
  top: number
  width: number
  height: number
  text: string
}

function parseTsvWords(tsv: string): TsvWord[] {
  const lines = tsv.trim().split(/\r?\n/)
  const words: TsvWord[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t')
    if (cols.length < 12) continue
    const level = parseInt(cols[0], 10)
    if (level !== 5) continue
    const text = (cols[11] ?? '').trim()
    if (!text) continue
    words.push({
      left: parseInt(cols[6], 10) || 0,
      top: parseInt(cols[7], 10) || 0,
      width: parseInt(cols[8], 10) || 0,
      height: parseInt(cols[9], 10) || 0,
      text,
    })
  }
  return words
}

function parseWithTsv(tsv: string): ExtractedAdLevelData | null {
  const words = parseTsvWords(tsv)
  if (words.length < 6) return null

  const byTop = new Map<number, TsvWord[]>()
  const topTol = 20
  for (const w of words) {
    const key = Math.round(w.top / topTol) * topTol
    if (!byTop.has(key)) byTop.set(key, [])
    byTop.get(key)!.push(w)
  }

  const rows = Array.from(byTop.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, ws]) => ws.sort((a, b) => a.left - b.left))

  const dataRow = rows.find(
    (r) =>
      r.some((w) => /^\$[\d,.]+$/.test(w.text)) &&
      r.some((w) => /^[\d,]+$/.test(w.text)) &&
      r.some((w) => /%$/.test(w.text))
  )
  if (!dataRow || dataRow.length < 6) return null

  const values = dataRow.map((w) => w.text.trim()).filter((t) => t.length > 0)
  const result = parseWithOrderedValues(values)
  return Object.keys(result).length >= 4 ? result : null
}

/**
 * Extract by strict left-to-right order.
 * Table columns: Bid | Impressions | Top-of-search | Clicks | Total cost | CPC | Purchases | Sales | ACOS
 */
function parseWithOrderedValues(values: string[]): ExtractedAdLevelData {
  const out: ExtractedAdLevelData = {}
  let i = 0

  const advance = (): string | null => {
    while (i < values.length) {
      const v = (values[i++] ?? '').trim()
      if (v && !/^(rules|active|of|search|product|pages|total|cost)$/i.test(v))
        return v
    }
    return null
  }

  let v: string | null
  while ((v = advance())) {
    if (!v) break

    if (!out.bid && (/^\$[\d.]+$/.test(v) || /^\d+\.\d{2}$/.test(v))) {
      const num = parseFloat(v.replace('$', ''))
      if (num < 25) {
        out.bid = v.startsWith('$') ? v : `$${v}`
        continue
      }
    }
    if (!out.bid && /^\d{3,5}$/.test(v)) {
      const n = parseInt(v, 10)
      if (n >= 50 && n <= 9999) {
        out.bid = `$${(n / 100).toFixed(2)}`
        continue
      }
    }

    if (!out.impressions && (/^[\d,]+$/.test(v) || /^\d{2,}$/.test(v))) {
      out.impressions = v.replace(/\.(?=\d)/g, ',')
      continue
    }

    if (!out.clicks && (/^<[\d.]+%?$/.test(v) || (/^[\d.]+%$/.test(v) && parseFloat(v) <= 100))) continue

    if (!out.clicks && /^\d+$/.test(v)) {
      out.clicks = v
      continue
    }

    if (!out.totalCost && /^\$[\d,.]+$/.test(v)) {
      out.totalCost = v
      continue
    }

    if (!out.cpc && /^\$[\d.]+$/.test(v)) {
      out.cpc = v
      continue
    }

    if (!out.purchases && /^\d+$/.test(v)) {
      out.purchases = v
      continue
    }

    if (!out.sales && /^\$[\d,.]+$/.test(v)) {
      out.sales = v
      continue
    }

    if (!out.acos && (/%$/.test(v) || /^\d+\.?\d*$/.test(v))) {
      out.acos = v.includes('%') ? v : `${v}%`
      continue
    }
  }

  return out
}

/** Regex fallback: extract values from raw text in known column order */
function parseWithRegex(text: string): ExtractedAdLevelData {
  const tokens = text
    .replace(/\r?\n/g, ' ')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  return parseWithOrderedValues(tokens)
}

export function parseAdLevelOcrResult(
  text: string,
  blocks: unknown,
  tsv: string | null
): ExtractedAdLevelData {
  if (tsv && tsv.length > 50) {
    const tsvResult = parseWithTsv(tsv)
    if (tsvResult && Object.keys(tsvResult).length >= 5) return tsvResult
  }

  if (blocks && typeof blocks === 'object') {
    const words = collectWordsFromBlocks(blocks)
    if (words.length >= 6) {
      const byTop = new Map<number, typeof words>()
      for (const w of words) {
        const key = Math.round(w.bbox.y0 / 12) * 12
        if (!byTop.has(key)) byTop.set(key, [])
        byTop.get(key)!.push(w)
      }
      const rows = Array.from(byTop.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, ws]) => ws.sort((a, b) => a.bbox.x0 - b.bbox.x0))

      const dataRow = rows.find(
        (r) =>
          r.some((w) => /\$[\d.]/.test(w.text)) &&
          r.some((w) => /[\d,]{2,}/.test(w.text))
      )
      if (dataRow) {
        const values = dataRow.map((w) => w.text.trim())
        const blockResult = parseWithOrderedValues(values)
        if (Object.keys(blockResult).length >= 4) return blockResult
      }
    }
  }

  return parseWithRegex(text)
}

interface WordLike {
  text: string
  bbox: { x0: number; y0: number; x1: number; y1: number }
}

function collectWordsFromBlocks(blocks: unknown): WordLike[] {
  const words: WordLike[] = []
  const walk = (obj: unknown) => {
    if (!obj || typeof obj !== 'object') return
    const o = obj as Record<string, unknown>
    if (o.words && Array.isArray(o.words)) {
      for (const w of o.words) {
        const wo = w as Record<string, unknown>
        if (wo.text && wo.bbox)
          words.push({
            text: String(wo.text),
            bbox: wo.bbox as WordLike['bbox'],
          })
      }
    }
    if (o.paragraphs) for (const p of o.paragraphs as unknown[]) walk(p)
    if (o.lines) for (const l of o.lines as unknown[]) walk(l)
  }
  if (Array.isArray(blocks)) for (const b of blocks) walk(b)
  else walk(blocks)
  return words
}
