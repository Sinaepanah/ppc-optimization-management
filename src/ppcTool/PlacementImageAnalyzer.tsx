import { useState, useRef, useCallback, useEffect } from 'react'
import { createWorker } from 'tesseract.js'
import { preprocessPlacementForOcr } from './utils/placementPreprocess'
import {
  parsePlacementOcrResult,
  type ExtractedPlacementData,
  type PlacementRow,
} from './utils/placementParser'
import { NumberInputWithArrows, type FieldType } from './components/NumberInputWithArrows'

const PLACEMENT_ROW_KEYS: (keyof ExtractedPlacementData)[] = [
  'topOfSearch',
  'restOfSearch',
  'productPages',
]

const COLUMNS: Array<{ key: keyof PlacementRow; label: string; prefix?: string; suffix?: string; type: FieldType }> = [
  { key: 'bidAdjustment', label: 'Bid adj.', suffix: '%', type: 'percentWhole' },
  { key: 'impressions', label: 'Impressions', type: 'integer' },
  { key: 'clicks', label: 'Clicks', type: 'integer' },
  { key: 'ctr', label: 'CTR', suffix: '%', type: 'percent' },
  { key: 'totalCost', label: 'Total cost', prefix: '$', type: 'currency' },
  { key: 'cpc', label: 'CPC', prefix: '$', type: 'currency' },
  { key: 'purchases', label: 'Purchases', type: 'integer' },
  { key: 'sales', label: 'Sales', prefix: '$', type: 'currency' },
  { key: 'acos', label: 'ACOS', suffix: '%', type: 'percent' },
]

interface PlacementImageAnalyzerProps {
  isSelected?: boolean
  onSelect?: () => void
  runOcrRef?: React.MutableRefObject<((file: File) => void) | null>
  onDataChange?: (data: ExtractedPlacementData) => void
}

export function PlacementImageAnalyzer({ isSelected, onSelect, runOcrRef, onDataChange }: PlacementImageAnalyzerProps) {
  const [data, setData] = useState<ExtractedPlacementData | null>(null)
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
      await worker.setParameters({ tessedit_pageseg_mode: '6' })
      const preprocessed = await preprocessPlacementForOcr(file)
      const { data: ocrData } = await worker.recognize(preprocessed, {}, { blocks: true, tsv: true })
      await worker.terminate()
      const extracted = parsePlacementOcrResult(ocrData.text, ocrData.blocks, ocrData.tsv)
      setData(extracted)
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

  const updateCell = useCallback(
    (rowKey: keyof ExtractedPlacementData, colKey: keyof PlacementRow, value: string) => {
      setData((prev) => {
        if (!prev) return prev
        const row = prev[rowKey]
        if (!row) return prev
        const next = {
          ...prev,
          [rowKey]: { ...row, [colKey]: value },
        }
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

      {status !== 'idle' && data && (
        <div className="ppc-placement-results">
          <h3>Placement data</h3>
          <p className="ppc-form-hint">Review and correct values. Each row is a placement type.</p>
          <div className="ppc-placement-table-wrap">
            <table className="ppc-placement-table">
              <thead>
                <tr>
                  <th>Placement</th>
                  {COLUMNS.map((c) => (
                    <th key={c.key}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PLACEMENT_ROW_KEYS.map((rowKey) => {
                  const row = data[rowKey] as PlacementRow
                  if (!row) return null
                  return (
                    <tr key={rowKey}>
                      <td className="ppc-placement-name">{row.placementName}</td>
                      {COLUMNS.map((col) => (
                        <td key={col.key}>
                          <NumberInputWithArrows
                            value={row[col.key] ?? ''}
                            onChange={(v) => updateCell(rowKey, col.key, v)}
                            type={col.type}
                            prefix={col.prefix}
                            suffix={col.suffix}
                            placeholder="—"
                          />
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
