import { useCallback, useRef, useState } from 'react'
import { mergeSourceCsvRows, parseCSVText, parsePastedTabDelimited } from '../utils/csvHelpers'

interface UploaderProps {
  /** Current merged table from parent; used to append new CSV picks without losing prior files */
  currentRows: string[][]
  /** Filenames already loaded from CSV (same order as combined rows) */
  sourceCsvNames: string[]
  onRowsLoaded: (rows: string[][], hasHeader: boolean, meta?: { sourceFileNames?: string[] }) => void
  sourceCampaign: string
  onSourceCampaignChange: (value: string) => void
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsText(file, 'UTF-8')
  })
}

export function Uploader({
  currentRows,
  sourceCsvNames,
  onRowsLoaded,
  sourceCampaign,
  onSourceCampaignChange,
}: UploaderProps) {
  const [pasteText, setPasteText] = useState('')
  const [inputMode, setInputMode] = useState<'csv' | 'paste'>('csv')
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

  const handleClearSource = useCallback(() => {
    onRowsLoaded([], true, { sourceFileNames: [] })
  }, [onRowsLoaded])

  const handlePasteSubmit = useCallback(() => {
    const trimmed = pasteText.trim()
    if (!trimmed) return
    const rows = parsePastedTabDelimited(trimmed)
    if (rows.length > 0) {
      onRowsLoaded(rows, rows[0].length > 1)
    }
    setPasteText('')
  }, [pasteText, onRowsLoaded])

  const hasPasteMetrics = pasteText.trim().split(/\r?\n/).every((line) => line.includes('\t'))

  return (
    <section className="panel auto-exact-upload">
      <h2>Input data</h2>
      <p className="panel-desc">
        Upload one or more Amazon Search Term report CSVs (e.g. multiple 300-keyword batches). Rows are combined in
        order; duplicate header rows are skipped. Map columns below so the app can compute Spend, Sales, Orders, and
        optional Clicks/Impressions. Or paste tab-delimited rows.
      </p>

      <div className="auto-exact-source-campaign">
        <label htmlFor="source-campaign">Source Campaign (for export naming)</label>
        <input
          id="source-campaign"
          type="text"
          value={sourceCampaign}
          onChange={(e) => onSourceCampaignChange(e.target.value)}
          placeholder="e.g. Auto Campaign - Discovery"
        />
      </div>

      <div className="auto-exact-input-mode">
        <button
          type="button"
          className={`btn btn--secondary ${inputMode === 'csv' ? 'tabs__btn--active' : ''}`}
          onClick={() => setInputMode('csv')}
        >
          CSV upload
        </button>
        <button
          type="button"
          className={`btn btn--secondary ${inputMode === 'paste' ? 'tabs__btn--active' : ''}`}
          onClick={() => setInputMode('paste')}
        >
          Paste
        </button>
      </div>

      {inputMode === 'csv' && (
        <div className="auto-exact-csv">
          <label className="auto-exact-csv-label">
            Source CSV{sourceCsvNames.length !== 1 ? 's' : ''} (multi-select)
          </label>
          <p className="auto-exact-csv-hint muted">
            In the file dialog, select several files at once (Ctrl+click each file on Windows, Cmd+click on Mac), or use
            Choose Files again to <strong>add more</strong> batches to what is already loaded.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            multiple
            onChange={handleFileChange}
            className="auto-exact-file-input"
            disabled={csvLoading}
          />
          {csvLoading && <p className="muted auto-exact-csv-status">Loading files…</p>}
          {csvError && <p className="auto-exact-error auto-exact-csv-status">{csvError}</p>}
          {sourceCsvNames.length > 0 && !csvLoading && (
            <ul className="auto-exact-source-files" aria-label="Loaded source files">
              <li className="muted">
                {sourceCsvNames.length} file{sourceCsvNames.length === 1 ? '' : 's'} loaded
                {sourceCsvNames.length <= 5
                  ? `: ${sourceCsvNames.join(', ')}`
                  : `: ${sourceCsvNames.slice(0, 5).join(', ')}… (+${sourceCsvNames.length - 5} more)`}
              </li>
            </ul>
          )}
          {sourceCsvNames.length > 0 && !csvLoading && (
            <button type="button" className="btn btn--secondary auto-exact-clear-source" onClick={handleClearSource}>
              Clear source CSVs
            </button>
          )}
        </div>
      )}

      {inputMode === 'paste' && (
        <div className="auto-exact-paste">
          <label>Paste tab-delimited rows (first row = headers if multiple columns)</label>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste from spreadsheet (tab-delimited)..."
            rows={5}
          />
          {pasteText.trim().length > 0 && !hasPasteMetrics && (
            <p className="warning">Paste mode has only one column — no metrics. Use CSV upload for Spend/Sales/Orders.</p>
          )}
          <button type="button" className="btn btn--primary" onClick={handlePasteSubmit} disabled={!pasteText.trim()}>
            Load pasted data
          </button>
        </div>
      )}
    </section>
  )
}
