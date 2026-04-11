import { useState, useCallback, useMemo } from 'react'
import type { Campaign, DuplicateResult } from '../types'
import { findCrossCampaignDuplicates } from '../utils/deduplication'
import { LARGE_DATA_WARNING } from '../types'
import { ExportControls, type ExportFormat } from './ExportControls'

interface DeduplicationPanelProps {
  campaigns: Campaign[]
}

export function DeduplicationPanel({ campaigns }: DeduplicationPanelProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [minCampaigns, setMinCampaigns] = useState(2)
  const [exportFormat, setExportFormat] = useState<ExportFormat>('plain')
  const [copyFeedback, setCopyFeedback] = useState(false)

  const toggleCampaign = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    if (selectedIds.size === campaigns.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(campaigns.map((c) => c.id)))
  }, [campaigns, selectedIds.size])

  const selectedCampaigns = useMemo(
    () => campaigns.filter((c) => selectedIds.has(c.id)),
    [campaigns, selectedIds]
  )

  const totalTerms = useMemo(
    () => selectedCampaigns.reduce((sum, c) => sum + c.terms.length, 0),
    [selectedCampaigns]
  )

  const showLargeWarning = totalTerms >= LARGE_DATA_WARNING

  const duplicates = useMemo(() => {
    if (selectedCampaigns.length < 2) return []
    return findCrossCampaignDuplicates(selectedCampaigns, minCampaigns)
  }, [selectedCampaigns, minCampaigns])

  const duplicateTerms = useMemo(() => duplicates.map((d) => d.normalizedTerm), [duplicates])

  const showCopyFeedback = useCallback(() => {
    setCopyFeedback(true)
    setTimeout(() => setCopyFeedback(false), 2000)
  }, [])

  const [sortBy, setSortBy] = useState<'campaigns' | 'term'>('campaigns')
  const sortedDuplicates = useMemo(() => {
    if (sortBy === 'term') {
      return [...duplicates].sort((a, b) => a.normalizedTerm.localeCompare(b.normalizedTerm))
    }
    return duplicates
  }, [duplicates, sortBy])

  return (
    <section className="panel deduplication-panel">
      <h2>Cross-campaign deduplication</h2>
      <p className="panel-desc">
        Select 2 or more campaigns to find search terms that appear in multiple campaigns. Use the results for Exact campaigns or Negative keywords. When your CSVs include a <strong>Clicks</strong> column, the table shows clicks per file and a combined total for each keyword.
      </p>

      {campaigns.length === 0 ? (
        <p className="muted">Add campaigns in the Campaign Input tab first.</p>
      ) : (
        <>
          <div className="dedup-select">
            <div className="dedup-select__campaigns">
              <button type="button" className="btn btn--primary btn--small" onClick={selectAll}>
                {selectedIds.size === campaigns.length ? 'Deselect all' : 'Select all'}
              </button>
              {campaigns.map((c) => (
                <label key={c.id} className="dedup-select__item">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(c.id)}
                    onChange={() => toggleCampaign(c.id)}
                  />
                  <span>{c.name}</span>
                  <span className="muted">({c.terms.length})</span>
                </label>
              ))}
            </div>
            <div className="dedup-select__min">
              <label>
                Show terms in at least{' '}
                <input
                  type="number"
                  min={2}
                  max={20}
                  value={minCampaigns}
                  onChange={(e) => setMinCampaigns(Math.max(2, parseInt(e.target.value, 10) || 2))}
                />{' '}
                campaigns
              </label>
            </div>
          </div>

          <div className="dedup-actions">
            {showLargeWarning && (
              <p className="warning">
                Large dataset ({totalTerms.toLocaleString()} terms). Processing may take a moment.
              </p>
            )}
          </div>

          {duplicates.length > 0 && (
            <>
              <p className="dedup-summary">
                <strong>{duplicates.length}</strong> terms appear in {minCampaigns}+ campaigns.
              </p>
              <ExportControls
                items={duplicateTerms}
                format={exportFormat}
                onFormatChange={setExportFormat}
                onCopy={showCopyFeedback}
                onExportCSV={() => {}}
                label="Export duplicates"
              />
              {copyFeedback && <span className="feedback">Copied to clipboard.</span>}
              <div className="sort-control">
                Sort by:{' '}
                <button type="button" className="btn btn--small btn--secondary" onClick={() => setSortBy('campaigns')}>Campaign count</button>
                <button type="button" className="btn btn--small btn--secondary" onClick={() => setSortBy('term')}>Term A–Z</button>
              </div>
              <DupResultsTable results={sortedDuplicates} />
            </>
          )}

          {selectedCampaigns.length >= 2 && duplicates.length === 0 && (
            <p className="muted">No duplicates found for the selected campaigns and minimum count.</p>
          )}
        </>
      )}
    </section>
  )
}

function DupResultsTable({ results }: { results: DuplicateResult[] }) {
  return (
    <div className="table-wrap">
      <table className="results-table">
        <thead>
          <tr>
            <th>Normalized term</th>
            <th>Campaigns</th>
            <th>Count</th>
            <th>Clicks per CSV</th>
            <th>Total clicks</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <tr key={`${r.normalizedTerm}-${i}`}>
              <td><code>{r.normalizedTerm}</code></td>
              <td>{r.campaigns.join(', ')}</td>
              <td>{r.campaignCount}</td>
              <td>
                <ul className="example-list dedup-clicks-per-csv">
                  {r.campaigns.map((camp) => (
                    <li key={camp}>
                      <strong>{camp}:</strong> {(r.clicksByCampaign.get(camp) ?? 0).toLocaleString()}
                    </li>
                  ))}
                </ul>
              </td>
              <td>{r.totalClicks.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
