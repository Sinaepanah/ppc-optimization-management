import { useState, useRef, useCallback, useEffect } from 'react'
import { createWorker, PSM } from 'tesseract.js'
import { preprocessPlacementForOcr } from './utils/placementPreprocess'
import { parsePlacementOcrResult, type ExtractedPlacementData } from './utils/placementParser'

interface PlacementImageAnalyzerProps {
  isSelected?: boolean
  onSelect?: () => void
  runOcrRef?: React.MutableRefObject<((file: File) => void) | null>
  onDataChange?: (data: ExtractedPlacementData | null) => void
}

export function PlacementImageAnalyzer({ isSelected, onSelect, runOcrRef, onDataChange }: PlacementImageAnalyzerProps) {
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
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK })
      const preprocessed = await preprocessPlacementForOcr(file)
      const { data: ocrData } = await worker.recognize(preprocessed, {}, { blocks: true, tsv: true })
      await worker.terminate()
      const extracted = parsePlacementOcrResult(ocrData.text, ocrData.blocks, ocrData.tsv)
      onDataChange?.(extracted)
      setStatus('done')
      setProgress(100)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OCR failed')
      setStatus('error')
    }
  }, [])

  const handleFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file?.type.startsWith('image/')) runOcr(file)
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
              <div className="ppc-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <p className="ppc-progress-text">Analyzing placement table… {progress}%</p>
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
