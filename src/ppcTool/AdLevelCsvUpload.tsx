import { useState, useRef, useCallback } from 'react'
import { parseAdLevelCsv } from './utils/adLevelCsvParser'
import { isSupportedTabularFile, readEncodedTextFile, TABULAR_UPLOAD_ACCEPT } from '../utils/readEncodedTextFile'

const AD_LEVEL_KEYS = ['bid', 'impressions', 'clicks', 'totalCost', 'cpc', 'purchases', 'sales', 'acos'] as const

interface AdLevelCsvUploadProps {
  onDataChange?: (data: Record<string, string>) => void
}

export function AdLevelCsvUpload({ onDataChange }: AdLevelCsvUploadProps) {
  const [, setStatus] = useState<'idle' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const parseCsv = useCallback(
    async (file: File) => {
      setError(null)
      try {
        const text = await readEncodedTextFile(file)
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
    },
    [onDataChange]
  )

  const handleFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file && isSupportedTabularFile(file)) {
        parseCsv(file)
      } else if (file) {
        setError('Please select a CSV or Excel file')
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
      if (file && isSupportedTabularFile(file)) {
        parseCsv(file)
      } else if (file) {
        setError('Please drop a CSV or Excel file')
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
          accept={TABULAR_UPLOAD_ACCEPT}
          onChange={handleFile}
          className="ppc-upload-input"
        />
        <div className="ppc-upload-content">
          <span className="ppc-upload-icon">📄</span>
          <p className="ppc-upload-title">Drop CSV/Excel or click to browse</p>
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
