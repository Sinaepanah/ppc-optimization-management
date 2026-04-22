import { useMemo } from 'react'
import { normalize } from '../../utils/normalize'
import { lookupReferenceMetrics, type ReferenceExactResult } from '../utils/referenceExact'

function formatPct(n: number): string {
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`
}

type ManualKeywordsVsReferenceProps = {
  manualSegments: string[]
  referenceExactData: ReferenceExactResult | null
  exportAsin: string
  onExportAsinChange: (value: string) => void
  selectedNotInRefIndices: Set<number>
  onSelectedNotInRefChange: (next: Set<number>) => void
}

export function ManualKeywordsVsReference({
  manualSegments,
  referenceExactData,
  exportAsin,
  onExportAsinChange,
  selectedNotInRefIndices,
  onSelectedNotInRefChange,
}: ManualKeywordsVsReferenceProps) {
  const asin = exportAsin.trim() || null

  const rows = useMemo(() => {
    const map = referenceExactData?.metricsByKeyword ?? null
    return manualSegments.map((keywordSegment, index) => {
      const norm = normalize(keywordSegment)
      const exact = norm ? lookupReferenceMetrics(map, norm, asin) : null
      return { keywordSegment, index, exact }
    })
  }, [manualSegments, referenceExactData, asin])

  if (manualSegments.length === 0) return null

  return (
    <section className="panel auto-exact-manual-vs-ref" aria-labelledby="auto-exact-manual-vs-ref-heading">
      <h2 id="auto-exact-manual-vs-ref-heading">Custom manual keywords vs Reference Exact</h2>
      <p className="panel-desc muted">
        Same lookup as the Promote table: each line is the Exact campaign <strong>keyword</strong> (middle segment in{' '}
        <code>(INTENT) I keyword I EXACT I SP I ASIN</code>), or paste a full campaign title to extract it. Optional
        ASIN filters to one product; leave blank to use the first matching ASIN for that keyword.
      </p>
      {referenceExactData && referenceExactData.metricsByKeyword.size > 0 && (
        <div className="auto-exact-manual-vs-ref__asin-field">
          <label htmlFor="auto-exact-manual-vs-ref-asin">Filter by ASIN (optional)</label>
          <input
            id="auto-exact-manual-vs-ref-asin"
            type="text"
            className="auto-exact-manual-vs-ref__asin-input"
            placeholder="e.g. B0G4HV1QDP"
            autoComplete="off"
            spellCheck={false}
            value={exportAsin}
            onChange={(e) => onExportAsinChange(e.target.value)}
          />
        </div>
      )}
      {!referenceExactData || referenceExactData.metricsByKeyword.size === 0 ? (
        <p className="muted">
          Upload <strong>Reference Exact CSV</strong> (e.g. your Exact campaign export) to see whether each manual
          keyword has a row that parsed with keyword + ASIN.
        </p>
      ) : (
        <div className="table-wrap">
          <p className="muted auto-exact-manual-vs-ref__export-hint">
            Check keywords with <strong>No</strong> to add them to the Export copy list (after Analyze), same format as
            selected Promote rows.
          </p>
          <table className="results-table results-table--compact">
            <thead>
              <tr>
                <th scope="col" className="auto-exact-manual-vs-ref__check-col">
                  Export
                </th>
                <th scope="col">Keyword (manual)</th>
                <th scope="col">In Reference Exact</th>
                <th scope="col" className="auto-exact-manual-vs-ref__num">
                  Ref. clicks
                </th>
                <th scope="col" className="auto-exact-manual-vs-ref__num">
                  Ref. orders
                </th>
                <th scope="col" className="auto-exact-manual-vs-ref__num">
                  Ref. sales
                </th>
                <th scope="col" className="auto-exact-manual-vs-ref__num">
                  Ref. ACOS
                </th>
                <th scope="col" className="auto-exact-manual-vs-ref__num">
                  Ref. ROAS
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ keywordSegment, index, exact }) => (
                <tr key={`${index}-${keywordSegment}`}>
                  <td className="auto-exact-manual-vs-ref__check-col">
                    {!exact ? (
                      <input
                        type="checkbox"
                        checked={selectedNotInRefIndices.has(index)}
                        onChange={() => {
                          const next = new Set(selectedNotInRefIndices)
                          if (next.has(index)) next.delete(index)
                          else next.add(index)
                          onSelectedNotInRefChange(next)
                        }}
                        aria-label={`Include ${keywordSegment} in export list`}
                      />
                    ) : (
                      <span className="muted" aria-hidden>
                        —
                      </span>
                    )}
                  </td>
                  <td>
                    <code>{keywordSegment}</code>
                  </td>
                  <td>
                    {exact ? (
                      <span className="auto-exact-manual-vs-ref__yes">Yes</span>
                    ) : (
                      <span className="auto-exact-manual-vs-ref__no">No</span>
                    )}
                  </td>
                  <td className="auto-exact-manual-vs-ref__num">{exact ? exact.clicks.toLocaleString() : '—'}</td>
                  <td className="auto-exact-manual-vs-ref__num">{exact ? exact.orders.toLocaleString() : '—'}</td>
                  <td className="auto-exact-manual-vs-ref__num">{exact ? exact.sales.toLocaleString() : '—'}</td>
                  <td className="auto-exact-manual-vs-ref__num">
                    {exact && exact.sales > 0 ? formatPct(exact.acosPct) : '—'}
                  </td>
                  <td className="auto-exact-manual-vs-ref__num">
                    {exact && exact.roas != null ? exact.roas.toFixed(2) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
