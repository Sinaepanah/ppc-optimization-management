import { useCallback, useRef, useState } from 'react'
import { mergeSourceCsvRows, parseCSVText } from '../utils/csvHelpers'

interface UploaderProps {
  /** Current merged table from parent; used to append new CSV picks without losing prior files */
  currentRows: string[][]
  /** Filenames already loaded from CSV (same order as combined rows) */
  sourceCsvNames: string[]
  onRowsLoaded: (rows: string[][], hasHeader: boolean, meta?: { sourceFileNames?: string[] }) => void
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsText(file, 'UTF-8')
  })
}

export function Uploader({ currentRows, sourceCsvNames, onRowsLoaded }: UploaderProps) {
  const [csvLoading, setCsvLoading] = useState(false)
  const [csvError, setCsvError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const list = e.target.files
      if (!list?.length) return
      const files = Array.from(list)
      setCsvLoading(true)
      setCsvError(null)
      try {
        const texts = await Promise.all(files.map((f) => readFileAsText(f)))
        const parsed = texts.map((t) => parseCSVText(t))
        const appendToCsv =
          sourceCsvNames.length > 0 && currentRows.length > 0
        const merged = mergeSourceCsvRows(appendToCsv ? [currentRows, ...parsed] : parsed)
        const newNames = appendToCsv ? [...sourceCsvNames, ...files.map((f) => f.name)] : files.map((f) => f.name)
        if (merged.length > 0) {
          onRowsLoaded(merged, true, { sourceFileNames: newNames })
        } else {
          onRowsLoaded([], true, { sourceFileNames: [] })
        }
      } catch (err) {
        setCsvError(err instanceof Error ? err.message : 'Could not read CSV files.')
      } finally {
        setCsvLoading(false)
        e.target.value = ''
      }
    },
    [onRowsLoaded, currentRows, sourceCsvNames]
  )

  const handleClear = useCallback(() => {
    setCsvError(null)
    onRowsLoaded([], true, { sourceFileNames: [] })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [onRowsLoaded])

  return (
    <section className="panel auto-exact-upload">
      <h2>Input data</h2>
      <div className="auto-exact-csv">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt"
          multiple
          onChange={handleFileChange}
          className="auto-exact-file-input"
          disabled={csvLoading}
        />
        {csvLoading && <p className="muted auto-exact-csv-status">Loading…</p>}
        {csvError && <p className="auto-exact-error auto-exact-csv-status">{csvError}</p>}
        {sourceCsvNames.length > 0 && !csvLoading && (
          <>
            <ul className="auto-exact-source-files" aria-label="Loaded source files">
              <li className="muted">
                {sourceCsvNames.length} file{sourceCsvNames.length === 1 ? '' : 's'} loaded
                {sourceCsvNames.length <= 8
                  ? `: ${sourceCsvNames.join(', ')}`
                  : `: ${sourceCsvNames.slice(0, 8).join(', ')}… (+${sourceCsvNames.length - 8} more)`}
              </li>
            </ul>
            <button type="button" className="btn btn--secondary auto-exact-clear-source" onClick={handleClear}>
              Clear
            </button>
          </>
        )}
      </div>
    </section>
  )
}
