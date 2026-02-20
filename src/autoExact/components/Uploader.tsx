import { useCallback, useRef, useState } from 'react'
import { parseCSVText, parsePastedTabDelimited } from '../utils/csvHelpers'

interface UploaderProps {
  onRowsLoaded: (rows: string[][], hasHeader: boolean) => void
  sourceCampaign: string
  onSourceCampaignChange: (value: string) => void
}

export function Uploader({ onRowsLoaded, sourceCampaign, onSourceCampaignChange }: UploaderProps) {
  const [pasteText, setPasteText] = useState('')
  const [inputMode, setInputMode] = useState<'csv' | 'paste'>('csv')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const text = String(reader.result ?? '')
        const rows = parseCSVText(text)
        if (rows.length > 0) onRowsLoaded(rows, true)
      }
      reader.readAsText(file, 'UTF-8')
      e.target.value = ''
    },
    [onRowsLoaded]
  )

  const handlePasteSubmit = useCallback(() => {
    const trimmed = pasteText.trim()
    if (!trimmed) return
    const rows = parsePastedTabDelimited(trimmed)
    if (rows.length > 0) onRowsLoaded(rows, rows[0].length > 1)
    setPasteText('')
  }, [pasteText, onRowsLoaded])

  const hasPasteMetrics = pasteText.trim().split(/\r?\n/).every((line) => line.includes('\t'))

  return (
    <section className="panel auto-exact-upload">
      <h2>Input data</h2>
      <p className="panel-desc">
        Upload an Amazon Search Term report CSV or paste tab-delimited rows. Map columns below so the app can compute Spend, Sales, Orders, and optional Clicks/Impressions.
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
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            onChange={handleFileChange}
            className="auto-exact-file-input"
          />
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
