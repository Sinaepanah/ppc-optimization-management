import { useState, useRef, useCallback } from 'react'
import { parseAdLevelCsv } from './utils/adLevelCsvParser'

const AD_LEVEL_KEYS = ['bid', 'impressions', 'clicks', 'totalCost', 'cpc', 'purchases', 'sales', 'acos'] as const

interface AdLevelCsvUploadProps {
  onDataChange?: (data: Record<string, string>) => void
}

export function AdLevelCsvUpload({ onDataChange }: AdLevelCsvUploadProps) {
  const [status, setStatus] = useState<'idle' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const parseCsv = useCallback(
    (file: File) => {
      setError(null)
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const text = String(reader.result ?? '')
          const extracted = parseAdLevelCsv(text)
          const next: Record<string, string> = {}
          for (const k of AD_LEVEL_KEYS) {
            next[k] = extracted[k as keyof typeof extracted] ?? ''
          }
          onDataChange?.(next)
          setStatus('done')
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to parse CSV')
          setStatus('error')
        }
      }
      reader.onerror = () => {
        setError('Failed to read file')
        setStatus('error')
      }
      reader.readAsText(file, 'UTF-8')
    },
    [onDataChange]
  )

  const handleFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file && (file.name.endsWith('.csv') || file.type === 'text/csv' || file.type === 'application/csv')) {
        parseCsv(file)
      } else if (file) {
        setError('Please select a CSV file')
        setStatus('error')
      }
      e.target.value = ''
    },
    [parseCsv]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const file = e.dataTransfer.files[0]
      if (file?.name.endsWith('.csv') || file?.type === 'text/csv' || file?.type === 'application/csv') {
        parseCsv(file)
      } else if (file) {
        setError('Please drop a CSV file')
        setStatus('error')
      }
    },
    [parseCsv]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => e.preventDefault(), [])

  const handleBrowseClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    fileInputRef.current?.click()
  }, [])

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

  const handleClear = useCallback(() => {
    const empty: Record<string, string> = {}
    for (const f of FIELDS) empty[f.key] = ''
    setValues(empty)
    setStatus('idle')
    setError(null)
    onDataChange?.(empty)
  }, [onDataChange])

  return (
    <div className="ppc-csv-upload">
      <div
        className="ppc-upload-zone ppc-csv-upload-zone"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv,application/csv"
          onChange={handleFile}
          className="ppc-upload-input"
        />
        <div className="ppc-upload-content">
          <span className="ppc-upload-icon">📄</span>
          <p className="ppc-upload-title">Drop CSV or click to browse</p>
          <p className="ppc-upload-hint">
            Ad-level metrics: Bid, Impressions, Clicks, Total Cost, CPC, Purchases, Sales, ACOS
          </p>
          <button type="button" className="ppc-browse-btn" onClick={handleBrowseClick}>
            Browse
          </button>
        </div>
      </div>

      {error && <p className="ppc-error">{error}</p>}
    </div>
  )
}
