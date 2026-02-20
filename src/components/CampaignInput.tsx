import { useState, useCallback, useRef, type FC } from 'react'
import type { Campaign } from '../types'
import { parseCSV, getColumnOptions, detectSearchTermColumn } from '../utils/csv'
import { normalize } from '../utils/normalize'
import { buildCampaignFromTerms } from '../utils/deduplication'
import { CSVColumnSelector } from './CSVColumnSelector'

interface CampaignInputProps {
  campaigns: Campaign[]
  onCampaignsChange: (campaigns: Campaign[]) => void
}

function generateId(): string {
  return `camp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export const CampaignInput: FC<CampaignInputProps> = ({ campaigns, onCampaignsChange }) => {
  const [name, setName] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [csvRows, setCsvRows] = useState<string[][] | null>(null)
  const [csvColumnIndex, setCsvColumnIndex] = useState(0)
  const [showColumnSelector, setShowColumnSelector] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const addCampaign = useCallback(
    (terms: string[]) => {
      const built = buildCampaignFromTerms(terms)
      const campaign: Campaign = {
        ...built,
        id: generateId(),
        name: name.trim() || `Campaign ${campaigns.length + 1}`,
      }
      onCampaignsChange([...campaigns, campaign])
      setName('')
      setPasteText('')
      setCsvRows(null)
      setShowColumnSelector(false)
    },
    [campaigns, name, onCampaignsChange]
  )

  const handlePasteSubmit = useCallback(() => {
    const lines = pasteText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    const terms: string[] = []
    for (const line of lines) {
      const n = normalize(line)
      if (n) terms.push(line)
    }
    if (terms.length === 0) return
    addCampaign(terms)
  }, [pasteText, addCampaign])

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const text = String(reader.result ?? '')
        const rows = parseCSV(text)
        if (rows.length === 0) return
        setCsvRows(rows)
        setCsvColumnIndex(getColumnOptions(rows).length ? detectSearchTermColumn(rows[0]) : 0)
        setShowColumnSelector(true)
      }
      reader.readAsText(file, 'UTF-8')
      e.target.value = ''
    },
    []
  )

  const handleCsvConfirm = useCallback(() => {
    if (!csvRows || csvRows.length < 1) return
    const terms: string[] = []
    const col = csvColumnIndex
    for (let i = 1; i < csvRows.length; i++) {
      const cell = csvRows[i][col]?.trim() ?? ''
      const n = normalize(cell)
      if (n) terms.push(cell)
    }
    const seen = new Set<string>()
    const unique: string[] = []
    for (const t of terms) {
      const n = normalize(t)
      if (n && !seen.has(n)) {
        seen.add(n)
        unique.push(t)
      }
    }
    if (unique.length > 0) addCampaign(unique)
  }, [csvRows, csvColumnIndex, addCampaign])

  const removeCampaign = useCallback(
    (id: string) => {
      onCampaignsChange(campaigns.filter((c) => c.id !== id))
    },
    [campaigns, onCampaignsChange]
  )

  return (
    <section className="panel campaign-input">
      <h2>Campaign Input</h2>
      <p className="panel-desc">Add campaigns by pasting search terms or uploading a CSV. Terms are deduplicated per campaign.</p>

      <div className="campaign-input__add">
        <div className="campaign-input__name">
          <label htmlFor="campaign-name">Campaign name</label>
          <input
            id="campaign-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Brand Campaign - Exact"
          />
        </div>

        <div className="campaign-input__paste">
          <label>Paste search terms (one per line)</label>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste one search term per line..."
            rows={5}
          />
          <button
            type="button"
            className="btn btn--primary"
            onClick={handlePasteSubmit}
            disabled={!pasteText.trim()}
          >
            Add campaign from paste
          </button>
        </div>

        <div className="campaign-input__csv">
          <label>Or upload CSV</label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            onChange={handleFileChange}
            className="campaign-input__file"
          />
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
              setShowColumnSelector(false)
            }}
          />
        </div>
      )}

      <div className="campaign-input__list">
        <h3>Your campaigns</h3>
        {campaigns.length === 0 ? (
          <p className="muted">No campaigns yet. Paste terms or upload a CSV above.</p>
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
