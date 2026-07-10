import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import type { Campaign, TopicProfile, RelevancyResult } from '../types'
import { runRelevancyFilter } from '../utils/relevancy'
import { ExportControls, type ExportFormat } from './ExportControls'

interface RelevancyFilterPanelProps {
  campaigns: Campaign[]
  profile: TopicProfile | null
}

function getTermAttributedSales(campaigns: Campaign[], normalizedTerm: string): number {
  let total = 0
  for (const c of campaigns) {
    total += c.normalizedToAttributedSales?.get(normalizedTerm) ?? 0
  }
  return total
}

/** Merge terms from several campaigns; first occurrence wins for display original when normalized duplicates. */
function mergeCampaignTerms(selected: Campaign[]): Array<{ original: string; normalized: string }> {
  const seen = new Set<string>()
  const out: Array<{ original: string; normalized: string }> = []
  for (const campaign of selected) {
    for (const norm of campaign.terms) {
      if (seen.has(norm)) continue
      seen.add(norm)
      out.push({
        original: campaign.normalizedToOriginal.get(norm) ?? norm,
        normalized: norm,
      })
    }
  }
  return out
}

export function RelevancyFilterPanel({ campaigns, profile }: RelevancyFilterPanelProps) {
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([])
  const [searchFilter, setSearchFilter] = useState('')
  const [sortBy, setSortBy] = useState<'alpha' | 'reason'>('alpha')
  const [zeroSalesOnly, setZeroSalesOnly] = useState(true)
  const [exportFormat, setExportFormat] = useState<ExportFormat>('plain')
  const [copyFeedback, setCopyFeedback] = useState(false)

  useEffect(() => {
    const valid = new Set(campaigns.map((c) => c.id))
    setSelectedCampaignIds((prev) => prev.filter((id) => valid.has(id)))
  }, [campaigns])

  const selectedCampaigns = useMemo(() => {
    const idSet = new Set(selectedCampaignIds)
    return campaigns.filter((c) => idSet.has(c.id))
  }, [campaigns, selectedCampaignIds])

  const toggleCampaignSelection = useCallback((id: string) => {
    setSelectedCampaignIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }, [])

  const allCampaignsSelected =
    campaigns.length > 0 && selectedCampaignIds.length === campaigns.length
  const someCampaignsSelected =
    selectedCampaignIds.length > 0 && selectedCampaignIds.length < campaigns.length

  const selectAllRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const el = selectAllRef.current
    if (el) el.indeterminate = someCampaignsSelected
  }, [someCampaignsSelected])

  const toggleSelectAllCampaigns = useCallback(() => {
    setSelectedCampaignIds((prev) => {
      if (campaigns.length === 0) return []
      if (prev.length === campaigns.length) return []
      return campaigns.map((c) => c.id)
    })
  }, [campaigns])

  const effectiveProfile = profile

  const termsWithOriginal = useMemo(
    () => mergeCampaignTerms(selectedCampaigns),
    [selectedCampaigns]
  )

  const results = useMemo((): RelevancyResult[] => {
    if (!effectiveProfile || termsWithOriginal.length === 0) return []
    return runRelevancyFilter(termsWithOriginal, effectiveProfile)
  }, [effectiveProfile, termsWithOriginal])

  // Only terms that matched an excluded topic — the true "keywords to negate" list
  const termsToNegate = useMemo(
    () => results.filter((r) => r.status === 'Flagged'),
    [results]
  )

  const salesFilteredTerms = useMemo(() => {
    return termsToNegate.filter((r) => {
      const sales = getTermAttributedSales(selectedCampaigns, r.normalizedTerm)
      return zeroSalesOnly ? sales === 0 : sales > 0
    })
  }, [termsToNegate, selectedCampaigns, zeroSalesOnly])

  const filteredResults = useMemo(() => {
    let list = salesFilteredTerms
    const q = searchFilter.trim().toLowerCase()
    if (q) list = list.filter((r) => r.originalTerm.toLowerCase().includes(q) || r.normalizedTerm.toLowerCase().includes(q))
    if (sortBy === 'alpha') {
      list = [...list].sort((a, b) => a.originalTerm.localeCompare(b.originalTerm))
    } else {
      list = [...list].sort((a, b) => a.reason.localeCompare(b.reason))
    }
    return list
  }, [salesFilteredTerms, searchFilter, sortBy])

  const flaggedTerms = useMemo(
    () => salesFilteredTerms.map((r) => r.originalTerm),
    [salesFilteredTerms]
  )

  const showCopyFeedback = useCallback(() => {
    setCopyFeedback(true)
    setTimeout(() => setCopyFeedback(false), 2000)
  }, [])

  return (
    <section className="panel relevancy-panel">
      <h2>Relevancy filter</h2>

      {profile && (
        <>
          <div className="relevancy-config">
            <div className="relevancy-config__row">
              <div className="relevancy-config__campaign-list" role="group" aria-labelledby="relevancy-campaigns-label">
                <div id="relevancy-campaigns-label" className="relevancy-config__campaign-list-heading">
                  Campaigns
                </div>
                <ul className="relevancy-config__campaign-checklist">
                  {campaigns.length > 0 && (
                    <li className="relevancy-config__campaign-checklist-selectall">
                      <label className="relevancy-config__campaign-option relevancy-config__campaign-option--select-all">
                        <input
                          ref={selectAllRef}
                          type="checkbox"
                          checked={allCampaignsSelected}
                          onChange={toggleSelectAllCampaigns}
                          aria-label="Select all campaigns"
                        />
                        <span className="relevancy-config__campaign-name">Select all</span>
                      </label>
                    </li>
                  )}
                  {campaigns.map((c) => (
                    <li key={c.id}>
                      <label className="relevancy-config__campaign-option">
                        <input
                          type="checkbox"
                          checked={selectedCampaignIds.includes(c.id)}
                          onChange={() => toggleCampaignSelection(c.id)}
                        />
                        <span className="relevancy-config__campaign-name">{c.name}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {selectedCampaigns.length > 0 && (
            <>
              <div className="relevancy-report">
                <h3 className="relevancy-report__title">
                  Keywords to negate
                  {flaggedTerms.length > 0 && (
                    <span className="relevancy-report__count"> ({flaggedTerms.length} terms)</span>
                  )}
                </h3>

                <div className="relevancy-report__copy">
                  <ExportControls
                    items={flaggedTerms}
                    format={exportFormat}
                    onFormatChange={setExportFormat}
                    onCopy={showCopyFeedback}
                    onExportCSV={() => {}}
                    label="Copy for Amazon campaign"
                  />
                  {copyFeedback && <span className="feedback">Copied to clipboard. Paste into your campaign.</span>}
                </div>
              </div>

              {(termsToNegate.length > 0 || searchFilter) && (
                <div className="relevancy-controls">
                  <input
                    type="text"
                    placeholder="Search within list..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    className="relevancy-controls__search"
                  />
                  <span className="relevancy-controls__sort">
                    Sales:{' '}
                    <button
                      type="button"
                      className={`btn btn--small ${zeroSalesOnly ? 'btn--primary' : 'btn--secondary'}`}
                      onClick={() => setZeroSalesOnly(true)}
                    >
                      Zero sales
                    </button>
                    <button
                      type="button"
                      className={`btn btn--small ${!zeroSalesOnly ? 'btn--primary' : 'btn--secondary'}`}
                      onClick={() => setZeroSalesOnly(false)}
                    >
                      With sales
                    </button>
                  </span>
                  <span className="relevancy-controls__sort">
                    Sort:{' '}
                    <button type="button" className="btn btn--small btn--secondary" onClick={() => setSortBy('alpha')}>A–Z</button>
                    <button type="button" className="btn btn--small btn--secondary" onClick={() => setSortBy('reason')}>By reason</button>
                  </span>
                </div>
              )}

              <RelevancyResultsTable
                results={filteredResults}
                totalToNegate={termsToNegate.length}
                salesFilteredTotal={salesFilteredTerms.length}
                zeroSalesOnly={zeroSalesOnly}
              />
            </>
          )}

        </>
      )}
    </section>
  )
}

function RelevancyResultsTable({
  results,
  totalToNegate,
  salesFilteredTotal,
  zeroSalesOnly,
}: {
  results: RelevancyResult[]
  totalToNegate: number
  salesFilteredTotal: number
  zeroSalesOnly: boolean
}) {
  return (
    <div className="table-wrap">
      <table className="results-table results-table--negation">
        <thead>
          <tr>
            <th>Keyword to negate</th>
            <th>Matched phrase</th>
            <th>Why negate</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <tr key={`${r.originalTerm}-${i}`} className="row-flagged">
              <td className="results-table__keyword">{r.originalTerm}</td>
              <td>{r.matchedExcludedIncludePhrases.join(', ') || '—'}</td>
              <td>{r.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {results.length === 0 && (
        <p className="muted">
          {totalToNegate === 0
            ? 'No keywords to negate. All terms are relevant to this profile (none matched excluded topics).'
            : salesFilteredTotal === 0
              ? zeroSalesOnly
                ? 'No flagged keywords with zero sales.'
                : 'No flagged keywords with sales.'
              : 'No keywords match your search.'}
        </p>
      )}
    </div>
  )
}
