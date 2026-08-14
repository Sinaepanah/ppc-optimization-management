import { useState, useRef, useCallback, useEffect } from 'react'
import { extractScreenshotViaVision } from './utils/visionExtract'
import type { ExtractedPlacementData } from './utils/placementParser'

interface PlacementImageAnalyzerProps {
  isSelected?: boolean
  onSelect?: () => void
  runOcrRef?: React.MutableRefObject<((file: File) => void) | null>
  onDataChange?: (data: ExtractedPlacementData | null) => void
}

export function PlacementImageAnalyzer({ isSelected, onSelect, runOcrRef, onDataChange }: PlacementImageAnalyzerProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const runOcr = useCallback(async (file: File) => {
    setStatus('loading')
    setError(null)
    try {
      const extracted = (await extractScreenshotViaVision(file, 'placement')) as ExtractedPlacementData
      onDataChange?.(extracted)
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
    <div className="ppc-placement-analyzer">
      <div
        className={`ppc-placement-upload ${isSelected ? 'ppc-upload-zone--selected' : ''}`}
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
            <p className="ppc-progress-text">Reading placement table…</p>
          </div>
        ) : (
          <div className="ppc-upload-content">
            <span className="ppc-upload-icon">📊</span>
            <p className="ppc-upload-title">Drop image or click to select for paste (Ctrl+V)</p>
            {isSelected && <span className="ppc-upload-selected-badge">Paste target (Ctrl+V)</span>}
            <p className="ppc-upload-hint">
              4×11 table: Placement Name, Campaign bid strategy, Bid adjustment, Impressions, Clicks, CTR, Total cost, CPC, Purchases, Sales, ACOS
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
