import { getApiBase } from '../../utils/storage'
import type { ExtractedPlacementData } from './placementParser'

export type VisionExtractMode = 'adLevel' | 'placement'

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
 * Call backend OpenAI vision extract. Same fields as the existing Exact Bid Tools forms.
 */
export async function extractScreenshotViaVision(
  file: File,
  mode: VisionExtractMode
): Promise<Record<string, string> | ExtractedPlacementData> {
  const { imageBase64, mimeType } = await fileToBase64Payload(file)
  const base = getApiBase().replace(/\/$/, '')
  const resp = await fetch(`${base}/api/ppc/extract-screenshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, mimeType, mode }),
  })

  let body: { error?: string; data?: Record<string, string> | ExtractedPlacementData } = {}
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
