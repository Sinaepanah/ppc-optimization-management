import { useState, useCallback, type FC } from 'react'
import type { Campaign } from '../types'
import { parseCSV, detectSearchTermColumn, findSearchTermReportHeaderRow } from '../utils/csv'
import { buildCampaignFromSearchTermRows } from '../utils/deduplication'
import { CSVColumnSelector } from './CSVColumnSelector'

interface CampaignInputProps {
  campaigns: Campaign[]
  onCampaignsChange: React.Dispatch<React.SetStateAction<Campaign[]>>
}

function generateId(): string {
  return `camp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsText(file, 'UTF-8')
  })
}

function stripExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, '').trim() || filename
}

function buildCampaignName(
  fileName: string,
  batchIndex: number,
  batchSize: number,
  nameField: string,
  existingCampaignCount: number
): string {
  const base = stripExtension(fileName)
  if (batchSize === 1) {
    return nameField.trim() || base || `Campaign ${existingCampaignCount + 1}`
  }
  if (nameField.trim()) {
    return `${nameField.trim()} — ${base || `file ${batchIndex + 1}`}`
  }
  return base || `Campaign ${existingCampaignCount + batchIndex + 1}`
}

export const CampaignInput: FC<CampaignInputProps> = ({ campaigns, onCampaignsChange }) => {
  const [name, setName] = useState('')
  const [csvRows, setCsvRows] = useState<string[][] | null>(null)
  const [csvColumnIndex, setCsvColumnIndex] = useState(0)
  const [showColumnSelector, setShowColumnSelector] = useState(false)
  /** Queued uploads; each becomes its own campaign after column confirm */
  const [pendingFiles, setPendingFiles] = useState<{ fileName: string; rows: string[][] }[] | null>(null)
  const [csvLoading, setCsvLoading] = useState(false)

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files
    if (!list?.length) return
    const files = Array.from(list)
    setCsvLoading(true)
    try {
      const parsed: { fileName: string; rows: string[][] }[] = []
      for (const file of files) {
        const text = await readFileAsText(file)
        const rows = parseCSV(text)
        if (rows.length > 0) parsed.push({ fileName: file.name, rows })
      }
      if (parsed.length === 0) return
      setPendingFiles(parsed)
      const first = parsed[0].rows
      setCsvRows(first)
      const headerRow = findSearchTermReportHeaderRow(first)
      const header = first[headerRow] ?? first[0]
      setCsvColumnIndex(header?.length ? detectSearchTermColumn(header) : 0)
      setShowColumnSelector(true)
    } finally {
      setCsvLoading(false)
      e.target.value = ''
    }
  }, [])

  const handleCsvConfirm = useCallback(() => {
    if (!pendingFiles?.length || csvRows === null) return
    const col = csvColumnIndex
    const existingCount = campaigns.length
    const batch = pendingFiles.length

    const toAdd: { built: ReturnType<typeof buildCampaignFromSearchTermRows>; name: string }[] = []
    pendingFiles.forEach((pf, idx) => {
      const built = buildCampaignFromSearchTermRows(pf.rows, col)
      if (built.terms.length === 0) return
      toAdd.push({
        built,
        name: buildCampaignName(pf.fileName, idx, batch, name, existingCount),
      })
    })

    if (toAdd.length === 0) {
      setPendingFiles(null)
      setCsvRows(null)
      setShowColumnSelector(false)
      return
    }

    onCampaignsChange((prev) => {
      let next = [...prev]
      for (const { built, name: cName } of toAdd) {
        next.push({
          ...built,
          id: generateId(),
          name: cName,
        })
      }
      return next
    })

    setName('')
    setCsvRows(null)
    setPendingFiles(null)
    setShowColumnSelector(false)
  }, [pendingFiles, csvRows, csvColumnIndex, campaigns.length, name, onCampaignsChange])

  const removeCampaign = useCallback(
    (id: string) => {
      onCampaignsChange((prev) => prev.filter((c) => c.id !== id))
    },
    [onCampaignsChange]
  )

  return (
    <section className="panel campaign-input">
      <h2>Campaign Input</h2>
      <p className="panel-desc">
        Add campaigns by uploading one or more CSV files (bulk). Each file becomes its own campaign. Terms are
        deduplicated per campaign. If the file includes a <strong>Clicks</strong> column, totals are summed per
        keyword for the Deduplication tab.
      </p>

      <div className="campaign-input__add">
        <div className="campaign-input__name">
          <label htmlFor="campaign-name">Campaign name</label>
          <input
            id="campaign-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Optional prefix; combined with file name when uploading multiple files"
          />
        </div>

        <div className="campaign-input__csv">
          <label htmlFor="campaign-csv-input">Upload CSV (bulk select)</label>
          <input
            id="campaign-csv-input"
            type="file"
            accept=".csv,.txt"
            multiple
            onChange={handleFileChange}
            className="campaign-input__file"
            disabled={csvLoading}
          />
          {csvLoading && <p className="muted campaign-input__csv-status">Loading files…</p>}
        </div>
      </div>

      {showColumnSelector && csvRows && (
        <div className="campaign-input__modal">
          <CSVColumnSelector
            rows={csvRows}
            selectedIndex={csvColumnIndex}
            onSelect={setCsvColumnIndex}
            onConfirm={handleCsvConfirm}
            onCancel={() => {
              setCsvRows(null)
              setPendingFiles(null)
              setShowColumnSelector(false)
            }}
          />
        </div>
      )}

      <div className="campaign-input__list">
        <h3>Your campaigns</h3>
        {campaigns.length === 0 ? (
          <p className="muted">No campaigns yet. Upload one or more CSV files above.</p>
        ) : (
          <ul>
            {campaigns.map((c) => (
              <li key={c.id} className="campaign-input__item">
                <span className="campaign-input__item-name">{c.name}</span>
                <span className="campaign-input__item-count">{c.terms.length} unique terms</span>
                <button
                  type="button"
                  className="btn btn--small btn--danger"
                  onClick={() => removeCampaign(c.id)}
                  aria-label={`Remove ${c.name}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
