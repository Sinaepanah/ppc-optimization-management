import { useCallback, useRef, useState } from 'react'
import { mergeSourceCsvRows, parseCSVText, parsePastedTabDelimited } from '../utils/csvHelpers'

interface UploaderProps {
  onRowsLoaded: (rows: string[][], hasHeader: boolean, meta?: { sourceFileCount: number }) => void
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

export function Uploader({ onRowsLoaded, sourceCampaign, onSourceCampaignChange }: UploaderProps) {
  const [pasteText, setPasteText] = useState('')
  const [inputMode, setInputMode] = useState<'csv' | 'paste'>('csv')
  const [csvLoading, setCsvLoading] = useState(false)
  const [csvError, setCsvError] = useState<string | null>(null)
  const [loadedSourceNames, setLoadedSourceNames] = useState<string[]>([])
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
        const merged = mergeSourceCsvRows(parsed)
        if (merged.length > 0) {
          setLoadedSourceNames(files.map((f) => f.name))
          onRowsLoaded(merged, true, { sourceFileCount: files.length })
        } else {
          setLoadedSourceNames([])
        }
      } catch (err) {
        setCsvError(err instanceof Error ? err.message : 'Could not read CSV files.')
        setLoadedSourceNames([])
      } finally {
        setCsvLoading(false)
        e.target.value = ''
      }
    },
    [onRowsLoaded]
  )

  const handlePasteSubmit = useCallback(() => {
    const trimmed = pasteText.trim()
    if (!trimmed) return
    const rows = parsePastedTabDelimited(trimmed)
    if (rows.length > 0) {
      setLoadedSourceNames([])
      onRowsLoaded(rows, rows[0].length > 1, { sourceFileCount: 1 })
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
            Source CSV{loadedSourceNames.length > 1 ? 's' : ''} (multi-select)
          </label>
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
          {loadedSourceNames.length > 0 && !csvLoading && (
            <ul className="auto-exact-source-files" aria-label="Loaded source files">
              <li className="muted">
                {loadedSourceNames.length} file{loadedSourceNames.length === 1 ? '' : 's'} loaded
                {loadedSourceNames.length <= 5
                  ? `: ${loadedSourceNames.join(', ')}`
                  : `: ${loadedSourceNames.slice(0, 5).join(', ')}… (+${loadedSourceNames.length - 5} more)`}
              </li>
            </ul>
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
