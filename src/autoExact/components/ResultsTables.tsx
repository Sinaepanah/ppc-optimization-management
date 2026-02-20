import { useEffect, useRef } from 'react'
import type { ScoredTerm } from '../types'

/** CPC that would achieve target ACoS: (targetAcosPct/100 * sales) / clicks */
function optimizedCpc(salesSum: number, clicksSum: number, targetAcosPct: number): number | null {
  if (clicksSum <= 0 || targetAcosPct <= 0) return null
  return (targetAcosPct / 100) * salesSum / clicksSum
}

interface ResultsTablesProps {
  promoteList: ScoredTerm[]
  reviewQueue: ScoredTerm[]
  hasClicks: boolean
  targetAcosForCpc: number
  selectedIndices: Set<number>
  onSelectionChange: (indices: Set<number>) => void
}

export function ResultsTables({ promoteList, reviewQueue, hasClicks, targetAcosForCpc, selectedIndices, onSelectionChange }: ResultsTablesProps) {
  const headerCheckRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const el = headerCheckRef.current
    if (el) el.indeterminate = selectedIndices.size > 0 && selectedIndices.size < promoteList.length
  }, [selectedIndices.size, promoteList.length])

  const toggleOne = (i: number) => {
    const next = new Set(selectedIndices)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    onSelectionChange(next)
  }
  const selectAll = () => onSelectionChange(new Set(promoteList.map((_, i) => i)))
  const deselectAll = () => onSelectionChange(new Set())

  return (
    <div className="auto-exact-results">
      <section className="panel">
        <h3>Promote to Exact</h3>
        <p className="panel-desc">
          {promoteList.length} terms meet all criteria. Select rows to include in export. Numbers are summed when the same term appears in multiple CSV rows (see Source rows).
        </p>
        {promoteList.length === 0 ? (
          <p className="muted">No terms qualify.</p>
        ) : (
          <div className="table-wrap">
            <table className="results-table">
              <thead>
                <tr>
                  <th className="auto-exact-th-checkbox">
                    <input
                      ref={headerCheckRef}
                      type="checkbox"
                      checked={selectedIndices.size === promoteList.length && promoteList.length > 0}
                      onChange={(e) => (e.target.checked ? selectAll() : deselectAll())}
                      aria-label="Select all"
                    />
                  </th>
                  <th>Original term</th>
                  <th>Source rows</th>
                  <th>Orders</th>
                  <th>Sales</th>
                  <th>Spend</th>
                  <th>ACoS %</th>
                  {hasClicks && <th>Clicks</th>}
                  {hasClicks && <th>CVR %</th>}
                  <th>Suggested CPC ({targetAcosForCpc}% ACoS)</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {promoteList.map((row, i) => (
                  <tr key={`${row.normalizedTerm}-${i}`}>
                    <td className="auto-exact-td-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedIndices.has(i)}
                        onChange={() => toggleOne(i)}
                        aria-label={`Select ${row.originalTerm}`}
                      />
                    </td>
                    <td className="results-table__keyword">{row.originalTerm}</td>
                    <td>{row.rowCount}</td>
                    <td>{row.ordersSum}</td>
                    <td>{row.salesSum.toFixed(2)}</td>
                    <td>{row.spendSum.toFixed(2)}</td>
                    <td>{row.acosPct.toFixed(1)}%</td>
                    {hasClicks && <td>{row.clicksSum}</td>}
                    {hasClicks && <td>{row.cvrPct != null ? `${row.cvrPct.toFixed(1)}%` : '—'}</td>}
                    <td>{(() => { const c = optimizedCpc(row.salesSum, row.clicksSum, targetAcosForCpc); return c != null ? `$${c.toFixed(2)}` : '—' })()}</td>
                    <td>{row.confidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h3>Review queue (borderline)</h3>
        <p className="panel-desc">Terms that nearly qualify — ACoS within +10% of max or orders = min−1 with decent sales.</p>
        {reviewQueue.length === 0 ? (
          <p className="muted">None.</p>
        ) : (
          <div className="table-wrap">
            <table className="results-table">
              <thead>
                <tr>
                  <th>Original term</th>
                  <th>Source rows</th>
                  <th>Orders</th>
                  <th>Sales</th>
                  <th>Spend</th>
                  <th>ACoS %</th>
                  {hasClicks && <th>Clicks</th>}
                  {hasClicks && <th>CVR %</th>}
                  <th>Suggested CPC ({targetAcosForCpc}% ACoS)</th>
                </tr>
              </thead>
              <tbody>
                {reviewQueue.map((row, i) => (
                  <tr key={`review-${row.normalizedTerm}-${i}`}>
                    <td className="results-table__keyword">{row.originalTerm}</td>
                    <td>{row.rowCount}</td>
                    <td>{row.ordersSum}</td>
                    <td>{row.salesSum.toFixed(2)}</td>
                    <td>{row.spendSum.toFixed(2)}</td>
                    <td>{row.acosPct.toFixed(1)}%</td>
                    {hasClicks && <td>{row.clicksSum}</td>}
                    {hasClicks && <td>{row.cvrPct != null ? `${row.cvrPct.toFixed(1)}%` : '—'}</td>}
                    <td>{(() => { const c = optimizedCpc(row.salesSum, row.clicksSum, targetAcosForCpc); return c != null ? `$${c.toFixed(2)}` : '—' })()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
