import { useState, useRef, useCallback, useEffect } from 'react'
import { extractScreenshotViaVision } from './utils/visionExtract'

const AD_LEVEL_KEYS = ['bid', 'impressions', 'clicks', 'totalCost', 'cpc', 'purchases', 'sales', 'acos'] as const

interface ImageUploadAnalyzerProps {
  isSelected?: boolean
  onSelect?: () => void
  runOcrRef?: React.MutableRefObject<((file: File) => void) | null>
  onDataChange?: (data: Record<string, string>) => void
}

export function ImageUploadAnalyzer({ isSelected, onSelect, runOcrRef, onDataChange }: ImageUploadAnalyzerProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const runOcr = useCallback(async (file: File) => {
    setStatus('loading')
    setError(null)
    try {
      const extracted = (await extractScreenshotViaVision(file, 'adLevel')) as Record<string, string>
      const next: Record<string, string> = {}
      for (const k of AD_LEVEL_KEYS) {
        next[k] = extracted[k] ?? ''
      }
      onDataChange?.(next)
      setStatus('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extract failed')
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
              <div className="ppc-progress-fill" style={{ width: '60%' }} />
            </div>
            <p className="ppc-progress-text">Reading screenshot…</p>
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
