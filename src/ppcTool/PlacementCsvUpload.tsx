import { useState, useRef, useCallback } from 'react'
import { parsePlacementCsv } from './utils/placementCsvParser'
import type { ExtractedPlacementData } from './utils/placementParser'
import { isSupportedTabularFile, readEncodedTextFile, TABULAR_UPLOAD_ACCEPT } from '../utils/readEncodedTextFile'

interface PlacementCsvUploadProps {
  onDataChange?: (data: ExtractedPlacementData | null) => void
}

export function PlacementCsvUpload({ onDataChange }: PlacementCsvUploadProps) {
  const [, setStatus] = useState<'idle' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const parseCsv = useCallback(
    async (file: File) => {
      setError(null)
      try {
        const text = await readEncodedTextFile(file)
        const extracted = parsePlacementCsv(text)
        onDataChange?.(extracted)
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
        className="ppc-placement-upload ppc-csv-upload-zone"
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
            Placement table: Top of search, Rest of search, Product pages and columns (Bid adj, Impressions, Clicks, etc.)
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
