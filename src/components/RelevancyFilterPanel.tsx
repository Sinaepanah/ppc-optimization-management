import { useState, useMemo, useCallback } from 'react'
import type { Campaign, TopicProfile, RelevancyResult } from '../types'
import { runRelevancyFilter } from '../utils/relevancy'
import { ExportControls, type ExportFormat } from './ExportControls'

interface RelevancyFilterPanelProps {
  campaigns: Campaign[]
  profile: TopicProfile | null
}

export function RelevancyFilterPanel({ campaigns, profile }: RelevancyFilterPanelProps) {
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('')
  const [searchFilter, setSearchFilter] = useState('')
  const [sortBy, setSortBy] = useState<'alpha' | 'reason'>('alpha')
  const [exportFormat, setExportFormat] = useState<ExportFormat>('plain')
  const [copyFeedback, setCopyFeedback] = useState(false)

  const campaign = useMemo(
    () => campaigns.find((c) => c.id === selectedCampaignId) ?? null,
    [campaigns, selectedCampaignId]
  )

  const effectiveProfile = profile

  const termsWithOriginal = useMemo(() => {
    if (!campaign) return []
    return campaign.terms.map((norm) => ({
      original: campaign.normalizedToOriginal.get(norm) ?? norm,
      normalized: norm,
    }))
  }, [campaign])

  const results = useMemo((): RelevancyResult[] => {
    if (!effectiveProfile || termsWithOriginal.length === 0) return []
    return runRelevancyFilter(termsWithOriginal, effectiveProfile)
  }, [effectiveProfile, termsWithOriginal])

  // Only terms that matched an excluded topic — the true "keywords to negate" list
  const termsToNegate = useMemo(
    () => results.filter((r) => r.status === 'Flagged'),
    [results]
  )

  const filteredResults = useMemo(() => {
    let list = termsToNegate
    const q = searchFilter.trim().toLowerCase()
    if (q) list = list.filter((r) => r.originalTerm.toLowerCase().includes(q) || r.normalizedTerm.toLowerCase().includes(q))
    if (sortBy === 'alpha') {
      list = [...list].sort((a, b) => a.originalTerm.localeCompare(b.originalTerm))
    } else {
      list = [...list].sort((a, b) => a.reason.localeCompare(b.reason))
    }
    return list
  }, [termsToNegate, searchFilter, sortBy])

  const flaggedTerms = useMemo(
    () => termsToNegate.map((r) => r.originalTerm),
    [termsToNegate]
  )

  const showCopyFeedback = useCallback(() => {
    setCopyFeedback(true)
    setTimeout(() => setCopyFeedback(false), 2000)
  }, [])

  return (
    <section className="panel relevancy-panel">
      <h2>Relevancy filter</h2>
      <p className="panel-desc">
        Select one campaign and a topic profile. Only terms that match an <strong>excluded</strong> topic (e.g. Drinking water, Pool) are listed below for negation. All other terms are kept.
      </p>

      {!profile ? (
        <p className="muted">Create or select a topic profile in the Topic profiles section (below) to use the relevancy filter.</p>
      ) : (
        <>
          <div className="relevancy-config">
            <div className="relevancy-config__row">
              <label>
                Campaign
                <select
                  value={selectedCampaignId}
                  onChange={(e) => setSelectedCampaignId(e.target.value)}
                >
                  <option value="">— Select campaign —</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {campaign && (
            <>
              <div className="relevancy-report">
                <h3 className="relevancy-report__title">
                  Keywords to negate
                  {flaggedTerms.length > 0 && (
                    <span className="relevancy-report__count"> ({flaggedTerms.length} terms)</span>
                  )}
                </h3>
                <p className="relevancy-report__desc">
                  These terms matched an excluded topic (e.g. drinking water, pool). Copy and paste into your Amazon campaign as negative keywords.
                </p>

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
                    Sort:{' '}
                    <button type="button" className="btn btn--small btn--secondary" onClick={() => setSortBy('alpha')}>A–Z</button>
                    <button type="button" className="btn btn--small btn--secondary" onClick={() => setSortBy('reason')}>By reason</button>
                  </span>
                </div>
              )}

              <RelevancyResultsTable
                results={filteredResults}
                totalToNegate={termsToNegate.length}
              />
            </>
          )}

          {!selectedCampaignId && campaigns.length > 0 && (
            <p className="muted">Select a campaign above to run the relevancy filter.</p>
          )}
        </>
      )}
    </section>
  )
}

function RelevancyResultsTable({
  results,
  totalToNegate,
}: {
  results: RelevancyResult[]
  totalToNegate: number
}) {
  return (
    <div className="table-wrap">
      <table className="results-table results-table--negation">
        <thead>
          <tr>
            <th>Keyword to negate</th>
            <th>Why negate</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <tr key={`${r.originalTerm}-${i}`} className="row-flagged">
              <td className="results-table__keyword">{r.originalTerm}</td>
              <td>{r.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {results.length === 0 && (
        <p className="muted">
          {totalToNegate === 0
            ? 'No keywords to negate. All terms are relevant to this profile (none matched excluded topics).'
            : 'No keywords match your search.'}
        </p>
      )}
    </div>
  )
}
