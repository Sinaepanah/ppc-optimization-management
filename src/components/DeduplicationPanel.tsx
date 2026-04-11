import { useState, useCallback, useMemo, type ReactNode } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
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

  return (
    <section className="panel deduplication-panel">
      <h2>Cross-campaign deduplication</h2>
      <p className="panel-desc">
        Select 2 or more campaigns to find search terms that appear in multiple campaigns. Use the results for Exact campaigns or Negative keywords. When your CSVs include a <strong>Clicks</strong> column, the table shows clicks per file and a combined total for each keyword. If clicks stay at 0, remove those campaigns and re-upload so the file is parsed with the correct header row.
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
              <DupResultsTable results={duplicates} />
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

type DupSortKey = 'term' | 'campaigns' | 'count' | 'clicksPerCsv' | 'totalClicks'

function clicksPerCsvSortKey(r: DuplicateResult): string {
  return r.campaigns.map((c) => String(r.clicksByCampaign.get(c) ?? 0)).join('\t')
}

function DupResultsTable({ results }: { results: DuplicateResult[] }) {
  const [sortKey, setSortKey] = useState<DupSortKey>('count')
  const [sortAsc, setSortAsc] = useState(false)

  const sorted = useMemo(() => {
    const arr = [...results]
    arr.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'term':
          cmp = a.normalizedTerm.localeCompare(b.normalizedTerm)
          break
        case 'campaigns':
          cmp = a.campaigns.join(', ').localeCompare(b.campaigns.join(', '))
          break
        case 'count':
          cmp = a.campaignCount - b.campaignCount
          break
        case 'clicksPerCsv': {
          cmp = clicksPerCsvSortKey(a).localeCompare(clicksPerCsvSortKey(b), undefined, { numeric: true })
          if (cmp === 0) cmp = a.totalClicks - b.totalClicks
          break
        }
        case 'totalClicks':
          cmp = a.totalClicks - b.totalClicks
          break
        default:
          cmp = 0
      }
      if (cmp === 0) cmp = a.normalizedTerm.localeCompare(b.normalizedTerm)
      return sortAsc ? cmp : -cmp
    })
    return arr
  }, [results, sortKey, sortAsc])

  const handleSort = useCallback((key: DupSortKey) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortAsc((a) => !a)
        return prevKey
      }
      setSortAsc(key === 'term' || key === 'campaigns')
      return key
    })
  }, [])

  const SortTh = ({
    colKey,
    children,
    align,
  }: {
    colKey: DupSortKey
    children: ReactNode
    align?: 'right'
  }) => {
    const ariaSort = sortKey === colKey ? (sortAsc ? 'ascending' : 'descending') : 'none'
    const activate = () => handleSort(colKey)
    return (
      <th
        scope="col"
        tabIndex={0}
        className="auto-exact-th-sortable dedup-th-sort"
        aria-sort={ariaSort}
        onClick={activate}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            activate()
          }
        }}
      >
        <span
          className={['auto-exact-th-inner', align === 'right' ? 'dedup-th-inner--right' : ''].filter(Boolean).join(' ')}
        >
          {children}
          {sortKey === colKey && (sortAsc ? <ChevronUp className="auto-exact-sort-icon" aria-hidden /> : <ChevronDown className="auto-exact-sort-icon" aria-hidden />)}
        </span>
      </th>
    )
  }

  return (
    <div className="table-wrap">
      <table className="results-table results-table--dedup-sort">
        <caption className="sr-only">
          Duplicate search terms across campaigns. Click a column heading to sort. Click again to reverse order.
        </caption>
        <thead>
          <tr>
            <SortTh colKey="term">Normalized term</SortTh>
            <SortTh colKey="campaigns">Campaigns</SortTh>
            <SortTh colKey="count" align="right">
              Count
            </SortTh>
            <SortTh colKey="clicksPerCsv">Clicks per CSV</SortTh>
            <SortTh colKey="totalClicks" align="right">
              Total clicks
            </SortTh>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={`${r.normalizedTerm}-${i}`}>
              <td>
                <code>{r.normalizedTerm}</code>
              </td>
              <td>{r.campaigns.join(', ')}</td>
              <td className="dedup-td-num">{r.campaignCount}</td>
              <td>
                <ul className="example-list dedup-clicks-per-csv">
                  {r.campaigns.map((camp) => (
                    <li key={camp}>
                      <strong>{camp}:</strong> {(r.clicksByCampaign.get(camp) ?? 0).toLocaleString()}
                    </li>
                  ))}
                </ul>
              </td>
              <td className="dedup-td-num">{r.totalClicks.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
