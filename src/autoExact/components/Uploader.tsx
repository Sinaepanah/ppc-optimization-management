import { useCallback, useRef, useState } from 'react'
import type { Campaign } from '../../types'
import { mergeSourceCsvRows, parseCSVText } from '../utils/csvHelpers'
import { normalizeSearchTermReportRows } from '../../utils/csv'
import { readEncodedTextFile, TABULAR_UPLOAD_ACCEPT } from '../../utils/readEncodedTextFile'
import { campaignHasSourceData } from '../utils/campaignSourceRows'

const CUSTOM_MANUAL_KEYWORDS_LABEL = 'CUSTOM MANUAL KEYWORDS'

interface UploaderProps {
  /** Current merged table from parent; used to append new CSV picks without losing prior files */
  currentRows: string[][]
  /** Filenames from Choose File uploads only */
  fileSourceNames: string[]
  /** All sources currently included (files + selected Campaign Input) */
  allSourceNames: string[]
  onRowsLoaded: (rows: string[][], hasHeader: boolean, meta?: { sourceFileNames?: string[] }) => void
  campaigns: Campaign[]
  selectedCampaignIds: Set<string>
  onSelectedCampaignIdsChange: (ids: Set<string>) => void
  onToggleCampaignSource: (id: string) => void
  onSelectAllCampaignSources: () => void
  manualKeywordText: string
  onManualKeywordTextChange: (text: string) => void
}

export function Uploader({
  currentRows,
  fileSourceNames,
  allSourceNames,
  onRowsLoaded,
  campaigns,
  selectedCampaignIds,
  onSelectedCampaignIdsChange,
  onToggleCampaignSource,
  onSelectAllCampaignSources,
  manualKeywordText,
  onManualKeywordTextChange,
}: UploaderProps) {
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
        const texts = await Promise.all(files.map((f) => readEncodedTextFile(f)))
        const parsed = texts.map((t) => normalizeSearchTermReportRows(parseCSVText(t)))
        const appendToCsv = currentRows.length > 0
        const merged = mergeSourceCsvRows(appendToCsv ? [currentRows, ...parsed] : parsed)
        const newNames = appendToCsv
          ? [...fileSourceNames, ...files.map((f) => f.name)]
          : files.map((f) => f.name)
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
    [onRowsLoaded, currentRows, fileSourceNames]
  )

  const handleClear = useCallback(() => {
    setCsvError(null)
    onRowsLoaded([], true, { sourceFileNames: [] })
    onSelectedCampaignIdsChange(new Set())
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [onRowsLoaded, onSelectedCampaignIdsChange])

  const hasAnySources = allSourceNames.length > 0
  const selectableCampaigns = campaigns.filter((c) => campaignHasSourceData(c))
  const allCampaignsSelected =
    selectableCampaigns.length > 0 &&
    selectableCampaigns.every((c) => selectedCampaignIds.has(c.id))

  return (
    <section className="panel auto-exact-upload">
      <h2>Input data</h2>
      <div className="auto-exact-csv">
        {campaigns.length > 0 && (
          <div className="auto-exact-source-campaign">
            <span className="auto-exact-csv-label">From Campaign Input</span>
            <p className="auto-exact-csv-hint muted">
              Select files already uploaded under Campaign Input to include alongside Choose File uploads.
            </p>
            <div className="dedup-select__campaigns">
              <button
                type="button"
                className="btn btn--primary btn--small"
                onClick={onSelectAllCampaignSources}
                disabled={selectableCampaigns.length === 0}
              >
                {allCampaignsSelected ? 'Deselect all' : 'Select all'}
              </button>
              {campaigns.map((c) => {
                const selectable = campaignHasSourceData(c)
                return (
                  <label key={c.id} className="dedup-select__item">
                    <input
                      type="checkbox"
                      checked={selectedCampaignIds.has(c.id)}
                      disabled={!selectable}
                      onChange={() => onToggleCampaignSource(c.id)}
                      title={selectable ? undefined : 'No terms in this campaign'}
                    />
                    <span>{c.name}</span>
                    <span className="muted">({c.terms.length})</span>
                  </label>
                )
              })}
            </div>
          </div>
        )}
        <label className="auto-exact-csv-label" htmlFor="auto-exact-source-file-input">
          Choose File
        </label>
        <input
          id="auto-exact-source-file-input"
          ref={fileInputRef}
          type="file"
          accept={TABULAR_UPLOAD_ACCEPT}
          multiple
          onChange={handleFileChange}
          className="auto-exact-file-input"
          disabled={csvLoading}
        />
        {csvLoading && <p className="muted auto-exact-csv-status">Loading…</p>}
        {csvError && <p className="auto-exact-error auto-exact-csv-status">{csvError}</p>}
        {hasAnySources && !csvLoading && (
          <>
            <ul className="auto-exact-source-files" aria-label="Loaded source files">
              <li className="muted">
                {allSourceNames.length} source{allSourceNames.length === 1 ? '' : 's'} loaded
                {allSourceNames.length <= 8
                  ? `: ${allSourceNames.join(', ')}`
                  : `: ${allSourceNames.slice(0, 8).join(', ')}… (+${allSourceNames.length - 8} more)`}
              </li>
            </ul>
            <button type="button" className="btn btn--secondary auto-exact-clear-source" onClick={handleClear}>
              Clear
            </button>
          </>
        )}
        <div className="auto-exact-manual-keywords">
          <label className="auto-exact-manual-keywords__label" htmlFor="auto-exact-manual-keywords-input">
            {CUSTOM_MANUAL_KEYWORDS_LABEL}
          </label>
          <textarea
            id="auto-exact-manual-keywords-input"
            className="auto-exact-manual-keywords__textarea"
            rows={5}
            spellCheck={false}
            autoComplete="off"
            placeholder="One Exact keyword per line — the middle segment in (INTENT) I keyword I EXACT I SP I ASIN (same as Reference CSV). You may paste a full campaign title; the keyword is extracted. Appended to CSV rows; metrics zero unless that keyword also appears in your Search Term file."
            value={manualKeywordText}
            onChange={(e) => onManualKeywordTextChange(e.target.value)}
          />
        </div>
      </div>
    </section>
  )
}
