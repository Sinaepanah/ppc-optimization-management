import { useState, useRef, useCallback, useEffect } from 'react'
import { createWorker, PSM } from 'tesseract.js'
import { preprocessForOcr } from './utils/imagePreprocess'
import { parseAdLevelOcrResult } from './utils/adLevelParser'

const AD_LEVEL_KEYS = ['bid', 'impressions', 'clicks', 'totalCost', 'cpc', 'purchases', 'sales', 'acos'] as const

interface ImageUploadAnalyzerProps {
  isSelected?: boolean
  onSelect?: () => void
  runOcrRef?: React.MutableRefObject<((file: File) => void) | null>
  onDataChange?: (data: Record<string, string>) => void
}

export function ImageUploadAnalyzer({ isSelected, onSelect, runOcrRef, onDataChange }: ImageUploadAnalyzerProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const runOcr = useCallback(async (file: File) => {
    setStatus('loading')
    setProgress(0)
    setError(null)
    try {
      const worker = await createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') setProgress(Math.round(m.progress * 100))
        },
      })
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_COLUMN,
      })
      const preprocessed = await preprocessForOcr(file)
      const { data } = await worker.recognize(preprocessed, {}, { blocks: true, tsv: true })
      await worker.terminate()
      const extracted = parseAdLevelOcrResult(data.text, data.blocks, data.tsv)
      const next: Record<string, string> = {}
      for (const k of AD_LEVEL_KEYS) {
        next[k] = extracted[k] ?? ''
      }
      onDataChange?.(next)
      setStatus('done')
      setProgress(100)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OCR failed')
      setStatus('error')
    }
  }, [onDataChange])

  const handleFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file && file.type.startsWith('image/')) runOcr(file)
      e.target.value = ''
    },
    [runOcr]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const file = e.dataTransfer.files[0]
      if (file?.type.startsWith('image/')) runOcr(file)
    },
    [runOcr]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => e.preventDefault(), [])

  useEffect(() => {
    if (runOcrRef) runOcrRef.current = runOcr
    return () => {
      if (runOcrRef) runOcrRef.current = null
    }
  }, [runOcr, runOcrRef])

  const handleZoneClick = useCallback(() => {
    onSelect?.()
  }, [onSelect])

  const handleBrowseClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    fileInputRef.current?.click()
  }, [])

  return (
    <div className="ppc-image-analyzer">
      <div
        className={`ppc-upload-zone ${isSelected ? 'ppc-upload-zone--selected' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={handleZoneClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFile}
          className="ppc-upload-input"
        />
        {status === 'loading' ? (
          <div className="ppc-upload-status">
            <div className="ppc-progress-bar">
              <div className="ppc-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <p className="ppc-progress-text">Analyzing image… {progress}%</p>
          </div>
        ) : (
          <div className="ppc-upload-content">
            <span className="ppc-upload-icon">📷</span>
            <p className="ppc-upload-title">Drop image or click to select for paste (Ctrl+V)</p>
            {isSelected && <span className="ppc-upload-selected-badge">Paste target (Ctrl+V)</span>}
            <p className="ppc-upload-hint">
              Screenshot of Amazon Campaign Manager ad-level metrics (Bid, Impressions, Clicks, etc.)
            </p>
            <button type="button" className="ppc-browse-btn" onClick={handleBrowseClick}>
              Browse
            </button>
          </div>
        )}
      </div>

      {error && <p className="ppc-error">{error}</p>}
    </div>
  )
}
