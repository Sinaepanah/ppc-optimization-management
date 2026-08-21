import { getApiBase } from '../../utils/storage'
import type { ExtractedPlacementData } from './placementParser'

export type VisionExtractMode = 'adLevel' | 'placement' | 'bulkKeywords'

export type BulkKeywordExtractRow = {
  keyword: string
  matchType: string
  bid: string
  impressions: string
  clicks: string
  spend: string
  cpc: string
  orders: string
  sales: string
  acos: string
  ctr: string
}

function fileToBase64Payload(file: File): Promise<{ imageBase64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const match = result.match(/^data:([^;]+);base64,(.+)$/)
      if (!match) {
        reject(new Error('Could not read image'))
        return
      }
      resolve({ mimeType: match[1] || file.type || 'image/png', imageBase64: match[2] })
    }
    reader.onerror = () => reject(new Error('Could not read image'))
    reader.readAsDataURL(file)
  })
}

/**
 * Call backend OpenAI vision extract.
 */
export async function extractScreenshotViaVision(
  file: File,
  mode: VisionExtractMode
): Promise<Record<string, string> | ExtractedPlacementData | { keywords: BulkKeywordExtractRow[] }> {
  const { imageBase64, mimeType } = await fileToBase64Payload(file)
  const base = getApiBase().replace(/\/$/, '')
  const resp = await fetch(`${base}/api/ppc/extract-screenshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, mimeType, mode }),
  })

  let body: {
    error?: string
    data?: Record<string, string> | ExtractedPlacementData | { keywords: BulkKeywordExtractRow[] }
  } = {}
  try {
    body = await resp.json()
  } catch {
    /* ignore */
  }

  if (!resp.ok) {
    throw new Error(body.error || `Extract failed (${resp.status})`)
  }
  if (!body.data) {
    throw new Error('Extract returned no data')
  }
  return body.data
}

/** Build a CSV string from vision keyword rows so Bulk PPC can reuse its parser/optimizer. */
export function bulkKeywordsToCsv(keywords: BulkKeywordExtractRow[]): string {
  const headers = [
    'Keyword',
    'Match Type',
    'Bid',
    'Impressions',
    'Clicks',
    'Spend',
    'CPC',
    'Orders',
    'Sales',
    'ACOS',
    'CTR',
  ]
  const escape = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [headers.join(',')]
  for (const k of keywords) {
    lines.push(
      [
        k.keyword,
        k.matchType,
        k.bid,
        k.impressions,
        k.clicks,
        k.spend,
        k.cpc,
        k.orders,
        k.sales,
        k.acos,
        k.ctr,
      ]
        .map(escape)
        .join(',')
    )
  }
  return lines.join('\n')
}
