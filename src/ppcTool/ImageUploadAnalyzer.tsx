import { useState, useRef, useCallback, useEffect } from 'react'
import { createWorker } from 'tesseract.js'
import { preprocessForOcr } from './utils/imagePreprocess'
import { parseAdLevelOcrResult, type ExtractedAdLevelData } from './utils/adLevelParser'
import { NumberInputWithArrows, type FieldType } from './components/NumberInputWithArrows'

const FIELDS: Array<{ key: keyof ExtractedAdLevelData; label: string; prefix?: string; suffix?: string; type: FieldType }> = [
  { key: 'bid', label: 'Bid', prefix: '$', type: 'currency' },
  { key: 'impressions', label: 'Impressions', type: 'integer' },
  { key: 'clicks', label: 'Clicks', type: 'integer' },
  { key: 'totalCost', label: 'Total Cost', prefix: '$', type: 'currency' },
  { key: 'cpc', label: 'CPC', prefix: '$', type: 'currency' },
  { key: 'purchases', label: 'Purchases', type: 'integer' },
  { key: 'sales', label: 'Sales', prefix: '$', type: 'currency' },
  { key: 'acos', label: 'ACOS', suffix: '%', type: 'percent' },
]

interface ImageUploadAnalyzerProps {
  isSelected?: boolean
  onSelect?: () => void
  runOcrRef?: React.MutableRefObject<((file: File) => void) | null>
  onDataChange?: (data: Record<string, string>) => void
}

export function ImageUploadAnalyzer({ isSelected, onSelect, runOcrRef, onDataChange }: ImageUploadAnalyzerProps) {
  const [values, setValues] = useState<Record<string, string>>({})
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
        tessedit_pageseg_mode: '4',
      })
      const preprocessed = await preprocessForOcr(file)
      const { data } = await worker.recognize(preprocessed, {}, { blocks: true, tsv: true })
      await worker.terminate()
      const extracted = parseAdLevelOcrResult(data.text, data.blocks, data.tsv)
      const next: Record<string, string> = {}
      for (const f of FIELDS) {
        const v = extracted[f.key]
        next[f.key] = v ?? ''
      }
      setValues(next)
      onDataChange?.(next)
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

  const updateField = useCallback(
    (key: string, value: string) => {
      setValues((prev) => {
        const next = { ...prev, [key]: value }
        onDataChange?.(next)
        return next
      })
    },
    [onDataChange]
  )

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

      {status !== 'idle' && (
        <div className="ppc-extracted-form">
          <h3>Extracted data</h3>
          <p className="ppc-form-hint">Review and correct values as needed.</p>
          <div className="ppc-fields">
            {FIELDS.map(({ key, label, prefix, suffix, type }) => (
              <div key={key} className="ppc-field">
                <label htmlFor={`ppc-${key}`}>{label}</label>
                <NumberInputWithArrows
                  id={`ppc-${key}`}
                  value={values[key] ?? ''}
                  onChange={(v) => updateField(key, v)}
                  type={type}
                  prefix={prefix}
                  suffix={suffix}
                  placeholder="—"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
