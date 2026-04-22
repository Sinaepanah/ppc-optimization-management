import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import type { ScoredTerm } from '../types'
import { getPerformanceLabel } from '../utils/performanceComparison'
import { suggestedCpcFromTargetAcos } from '../utils/suggestedCpc'
import { lookupReferenceMetrics, type ReferenceExactMetrics } from '../utils/referenceExact'

/** Actual average CPC from source data: CSV CPC on first row, then spend ÷ clicks after aggregation. */
function sourceActualCpc(row: ScoredTerm): number | null {
  if (row.clicksSum <= 0) return null
  return row.suggestedCpc ?? row.spendSum / row.clicksSum
}

function referenceActualCpc(exact: ReferenceExactMetrics | null): number | null {
  if (!exact || exact.clicks <= 0) return null
  return exact.spend / exact.clicks
}

function formatRoas(n: number | null | undefined): string {
  return n != null && Number.isFinite(n) ? n.toFixed(2) : '—'
}

/** Metrics that exist on both source and reference rows (pair compare + green winner) */
type PairCompareField = 'orders' | 'acos' | 'clicks' | 'cvr'

/** Source-only metrics (highlight only, no green vs ref) */
type SourceOnlyField = 'sales' | 'spend' | 'cpc'

type CompareField = PairCompareField | SourceOnlyField

/** Winner for pair metrics — mirrors performance rules (higher orders/clicks/CVR, lower ACoS when both have sales). */
function compareMetricWinner(
  row: ScoredTerm,
  exact: ReferenceExactMetrics,
  field: PairCompareField
): 'source' | 'ref' | null {
  if (field === 'orders') {
    if (row.ordersSum > exact.orders) return 'source'
    if (exact.orders > row.ordersSum) return 'ref'
    return null
  }
  if (field === 'clicks') {
    if (row.clicksSum > exact.clicks) return 'source'
    if (exact.clicks > row.clicksSum) return 'ref'
    return null
  }
  if (field === 'acos') {
    if (row.salesSum > 0 && exact.sales > 0) {
      if (row.acosPct < exact.acosPct) return 'source'
      if (exact.acosPct < row.acosPct) return 'ref'
      return null
    }
    if (row.salesSum > 0 && exact.sales <= 0) return 'source'
    if (row.salesSum <= 0 && exact.sales > 0) return 'ref'
    return null
  }
  if (field === 'cvr') {
    if (row.clicksSum > 0 && exact.clicks > 0) {
      const sc = row.cvrPct ?? 0
      const ec = exact.cvrPct ?? 0
      if (sc > ec) return 'source'
      if (ec > sc) return 'ref'
      return null
    }
    return null
  }
  return null
}

function compareCellClass(
  focus: { normalizedTerm: string; field: CompareField } | null,
  term: string,
  field: CompareField,
  side: 'source' | 'ref',
  row: ScoredTerm,
  exact: ReferenceExactMetrics | null,
  hasClicks: boolean
): string {
  if (!focus || focus.normalizedTerm !== term || focus.field !== field) return ''
  if (field === 'cvr' && !hasClicks) {
    return side === 'ref' && exact ? 'auto-exact-cell--compare-highlight' : ''
  }
  const pairFields: PairCompareField[] = ['orders', 'acos', 'clicks', 'cvr']
  const isPair = (pairFields as string[]).includes(field)
  if (!isPair) {
    return side === 'source' ? 'auto-exact-cell--compare-highlight' : ''
  }
  if (!exact) {
    return side === 'source' ? 'auto-exact-cell--compare-highlight' : ''
  }
  const w = compareMetricWinner(row, exact, field as PairCompareField)
  if (w === null) {
    return 'auto-exact-cell--compare-highlight auto-exact-cell--compare-tie'
  }
  if ((side === 'source' && w === 'source') || (side === 'ref' && w === 'ref')) {
    return 'auto-exact-cell--compare-highlight auto-exact-cell--compare-winner'
  }
  return 'auto-exact-cell--compare-highlight auto-exact-cell--compare-dim'
}

/** Keyboard + focus target for clickable metric cells (no calculation changes). */
function metricInteractProps(onActivate: () => void) {
  return {
    onClick: onActivate,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onActivate()
      }
    },
    tabIndex: 0 as const,
    role: 'button' as const,
  }
}

type PromoteSortKey =
  | 'originalTerm'
  | 'ordersSum'
  | 'salesSum'
  | 'spendSum'
  | 'acosPct'
  | 'sourceRoas'
  | 'clicksSum'
  | 'cvrPct'
  | 'sourceCurrCpc'
  | 'suggestedCpc'
  | 'refClicks'
  | 'refOrders'
  | 'refAcos'
  | 'refRoas'
  | 'refCvr'
  | 'refCurrCpc'

interface ResultsTablesProps {
  promoteList: ScoredTerm[]
  reviewQueue: ScoredTerm[]
  hasClicks: boolean
  targetAcosForCpc: number
  selectedIndices: Set<number>
  onSelectionChange: (indices: Set<number>) => void
  referenceExactMetrics?: Map<string, ReferenceExactMetrics> | null
  /** When set, Performance compares to the Exact campaign for this ASIN; otherwise first matching product for that keyword */
  referenceExportAsin: string
}

export function ResultsTables({
  promoteList,
  reviewQueue,
  hasClicks,
  targetAcosForCpc,
  selectedIndices,
  onSelectionChange,
  referenceExactMetrics,
  referenceExportAsin,
}: ResultsTablesProps) {
  const headerCheckRef = useRef<HTMLInputElement>(null)
  const [sortKey, setSortKey] = useState<PromoteSortKey>('originalTerm')
  const [sortAsc, setSortAsc] = useState(true)
  const [compareFocus, setCompareFocus] = useState<{ normalizedTerm: string; field: CompareField } | null>(null)

  const toggleCompare = useCallback(
    (
      normalizedTerm: string,
      field: CompareField,
      exact: ReferenceExactMetrics | null,
      clickedSide: 'source' | 'ref',
      hasClicksCol: boolean
    ) => {
      if (clickedSide === 'ref' && !exact) return
      if (field === 'cvr' && clickedSide === 'source' && !hasClicksCol) return
      setCompareFocus((prev) => {
        if (prev?.normalizedTerm === normalizedTerm && prev.field === field) return null
        return { normalizedTerm, field }
      })
    },
    []
  )

  useEffect(() => {
    const el = headerCheckRef.current
    if (el) el.indeterminate = selectedIndices.size > 0 && selectedIndices.size < promoteList.length
  }, [selectedIndices.size, promoteList.length])

  const handleSortClick = useCallback((key: PromoteSortKey) => {
    if (sortKey === key) {
      setSortAsc((a) => !a)
    } else {
      setSortKey(key)
      setSortAsc(true)
    }
  }, [sortKey])

  const refAsin = referenceExportAsin.trim() || null

  const lookupRef = useCallback(
    (normalizedTerm: string) =>
      lookupReferenceMetrics(referenceExactMetrics ?? null, normalizedTerm, refAsin),
    [referenceExactMetrics, refAsin]
  )

  const sortedIndices = useMemo(() => {
    const indices = promoteList.map((_, i) => i)
    indices.sort((a, b) => {
      const ra = promoteList[a]
      const rb = promoteList[b]
      let cmp = 0
      switch (sortKey) {
        case 'originalTerm':
          cmp = ra.originalTerm.localeCompare(rb.originalTerm)
          break
        case 'ordersSum':
          cmp = ra.ordersSum - rb.ordersSum
          break
        case 'salesSum':
          cmp = ra.salesSum - rb.salesSum
          break
        case 'spendSum':
          cmp = ra.spendSum - rb.spendSum
          break
        case 'acosPct':
          cmp = ra.acosPct - rb.acosPct
          break
        case 'sourceRoas':
          cmp = (ra.roas ?? -1) - (rb.roas ?? -1)
          break
        case 'clicksSum':
          cmp = ra.clicksSum - rb.clicksSum
          break
        case 'cvrPct':
          cmp = (ra.cvrPct ?? -1) - (rb.cvrPct ?? -1)
          break
        case 'sourceCurrCpc': {
          const ca = sourceActualCpc(ra)
          const cb = sourceActualCpc(rb)
          cmp = (ca ?? -1) - (cb ?? -1)
          break
        }
        case 'suggestedCpc': {
          const ca = suggestedCpcFromTargetAcos(ra.salesSum, ra.ordersSum, ra.clicksSum, targetAcosForCpc)
          const cb = suggestedCpcFromTargetAcos(rb.salesSum, rb.ordersSum, rb.clicksSum, targetAcosForCpc)
          cmp = (ca ?? -1) - (cb ?? -1)
          break
        }
        case 'refClicks': {
          const ea = lookupRef(ra.normalizedTerm)
          const eb = lookupRef(rb.normalizedTerm)
          cmp = (ea?.clicks ?? -1) - (eb?.clicks ?? -1)
          break
        }
        case 'refOrders': {
          const ea = lookupRef(ra.normalizedTerm)
          const eb = lookupRef(rb.normalizedTerm)
          cmp = (ea?.orders ?? -1) - (eb?.orders ?? -1)
          break
        }
        case 'refAcos': {
          const ea = lookupRef(ra.normalizedTerm)
          const eb = lookupRef(rb.normalizedTerm)
          cmp = (ea?.acosPct ?? -1) - (eb?.acosPct ?? -1)
          break
        }
        case 'refRoas': {
          const ea = lookupRef(ra.normalizedTerm)
          const eb = lookupRef(rb.normalizedTerm)
          cmp = (ea?.roas ?? -1) - (eb?.roas ?? -1)
          break
        }
        case 'refCvr': {
          const ea = lookupRef(ra.normalizedTerm)
          const eb = lookupRef(rb.normalizedTerm)
          cmp = (ea?.cvrPct ?? -1) - (eb?.cvrPct ?? -1)
          break
        }
        case 'refCurrCpc': {
          const ea = lookupRef(ra.normalizedTerm)
          const eb = lookupRef(rb.normalizedTerm)
          const ca = referenceActualCpc(ea)
          const cb = referenceActualCpc(eb)
          cmp = (ca ?? -1) - (cb ?? -1)
          break
        }
        default:
          cmp = 0
      }
      return sortAsc ? cmp : -cmp
    })
    return indices
  }, [promoteList, sortKey, sortAsc, targetAcosForCpc, lookupRef])

  const toggleOne = (i: number) => {
    const next = new Set(selectedIndices)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    onSelectionChange(next)
  }
  const selectAll = () => onSelectionChange(new Set(promoteList.map((_, i) => i)))
  const deselectAll = () => onSelectionChange(new Set())

  const SortableTh = ({
    colKey,
    children,
    rowSpan = 1,
    className,
  }: {
    colKey: PromoteSortKey
    children: React.ReactNode
    rowSpan?: number
    className?: string
  }) => {
    const ariaSort = sortKey === colKey ? (sortAsc ? 'ascending' : 'descending') : 'none'
    return (
      <th
        rowSpan={rowSpan > 1 ? rowSpan : undefined}
        className={['auto-exact-th-sortable', className].filter(Boolean).join(' ')}
        scope="col"
        aria-sort={ariaSort}
        onClick={() => handleSortClick(colKey)}
      >
        <span className="auto-exact-th-inner">
          {children}
          {sortKey === colKey && (sortAsc ? <ChevronUp className="auto-exact-sort-icon" aria-hidden /> : <ChevronDown className="auto-exact-sort-icon" aria-hidden />)}
        </span>
      </th>
    )
  }

  return (
    <div className="auto-exact-results">
      <section className="panel">
        <h3 id="promote-to-exact-heading">Promote to Exact</h3>
        {promoteList.length === 0 ? (
          <p className="muted">No terms qualify.</p>
        ) : (
          <div
            className="table-wrap table-wrap--compact table-wrap--promote"
            role="region"
            aria-labelledby="promote-to-exact-heading"
            tabIndex={-1}
          >
            <table className="results-table results-table--compact results-table--promote">
              <caption className="sr-only">
                Promote to Exact: source metrics from your search-term data, reference metrics from the Exact campaign CSV, current CPC and target-Acos-based suggested CPC on the source side, reference current CPC, and a performance summary. Use column headers to sort. Activate a number cell to compare source and reference for that metric.
              </caption>
              <thead>
                <tr>
                  <th rowSpan={2} className="auto-exact-th-checkbox" scope="col">
                    <input
                      ref={headerCheckRef}
                      type="checkbox"
                      checked={selectedIndices.size === promoteList.length && promoteList.length > 0}
                      onChange={(e) => (e.target.checked ? selectAll() : deselectAll())}
                      aria-label="Select all"
                    />
                  </th>
                  <SortableTh colKey="originalTerm" rowSpan={2} className="auto-exact-th-term">
                    Term
                  </SortableTh>
                  <th rowSpan={2} scope="col">Campaign(s)</th>
                  <SortableTh colKey="ordersSum" rowSpan={2}>
                    Orders
                  </SortableTh>
                  <SortableTh colKey="salesSum" rowSpan={2}>
                    Sales
                  </SortableTh>
                  <SortableTh colKey="spendSum" rowSpan={2}>
                    Spend
                  </SortableTh>
                  <SortableTh colKey="acosPct" rowSpan={2}>
                    ACoS
                  </SortableTh>
                  <SortableTh colKey="sourceRoas" rowSpan={2}>
                    ROAS
                  </SortableTh>
                  {hasClicks && (
                    <SortableTh colKey="clicksSum" rowSpan={2}>
                      Clicks
                    </SortableTh>
                  )}
                  {hasClicks && (
                    <SortableTh colKey="cvrPct" rowSpan={2}>
                      CVR
                    </SortableTh>
                  )}
                  <SortableTh colKey="sourceCurrCpc" rowSpan={2}>
                    Curr. CPC
                  </SortableTh>
                  <SortableTh colKey="suggestedCpc" rowSpan={2}>
                    CPC ({targetAcosForCpc}%)
                  </SortableTh>
                  <th colSpan={hasClicks ? 6 : 5} className="auto-exact-th-group-ref" scope="colgroup">
                    Reference Exact
                  </th>
                  <th rowSpan={2} className="auto-exact-th-performance" scope="col">
                    Perf
                  </th>
                </tr>
                <tr>
                  <SortableTh colKey="refClicks" className="auto-exact-th-ref auto-exact-th-ref--edge">
                    Clicks
                  </SortableTh>
                  <SortableTh colKey="refOrders" className="auto-exact-th-ref">
                    Orders
                  </SortableTh>
                  <SortableTh colKey="refAcos" className="auto-exact-th-ref">
                    ACoS
                  </SortableTh>
                  <SortableTh colKey="refRoas" className="auto-exact-th-ref">
                    ROAS
                  </SortableTh>
                  {hasClicks && (
                    <SortableTh colKey="refCvr" className="auto-exact-th-ref">
                      CVR
                    </SortableTh>
                  )}
                  <SortableTh colKey="refCurrCpc" className="auto-exact-th-ref">
                    Curr. CPC
                  </SortableTh>
                </tr>
              </thead>
              <tbody>
                {sortedIndices.map((origIdx) => {
                  const row = promoteList[origIdx]
                  const exact = lookupRef(row.normalizedTerm)
                  const term = row.normalizedTerm
                  const cc = (field: CompareField, side: 'source' | 'ref', extra?: string) =>
                    ['auto-exact-cell--metric', extra, compareCellClass(compareFocus, term, field, side, row, exact, hasClicks)]
                      .filter(Boolean)
                      .join(' ')
                  return (
                    <tr key={`${term}-${origIdx}`}>
                      <td className="auto-exact-td-checkbox">
                        <input
                          type="checkbox"
                          checked={selectedIndices.has(origIdx)}
                          onChange={() => toggleOne(origIdx)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select ${row.originalTerm}`}
                        />
                      </td>
                      <td className="results-table__keyword" title={row.originalTerm}>
                        {row.originalTerm}
                      </td>
                      <td title={row.campaignNames.join(', ')}>
                        {row.campaignNames.length > 0 ? row.campaignNames.join(', ') : '—'}
                      </td>
                      <td
                        className={cc('orders', 'source')}
                        {...metricInteractProps(() => toggleCompare(term, 'orders', exact, 'source', hasClicks))}
                      >
                        {row.ordersSum}
                      </td>
                      <td
                        className={cc('sales', 'source')}
                        {...metricInteractProps(() => toggleCompare(term, 'sales', exact, 'source', hasClicks))}
                      >
                        {row.salesSum.toFixed(2)}
                      </td>
                      <td
                        className={cc('spend', 'source')}
                        {...metricInteractProps(() => toggleCompare(term, 'spend', exact, 'source', hasClicks))}
                      >
                        {row.spendSum.toFixed(2)}
                      </td>
                      <td
                        className={cc('acos', 'source')}
                        {...metricInteractProps(() => toggleCompare(term, 'acos', exact, 'source', hasClicks))}
                      >
                        {row.acosPct.toFixed(1)}%
                      </td>
                      <td>{formatRoas(row.roas)}</td>
                      {hasClicks && (
                        <td
                          className={cc('clicks', 'source')}
                          {...metricInteractProps(() => toggleCompare(term, 'clicks', exact, 'source', hasClicks))}
                        >
                          {row.clicksSum}
                        </td>
                      )}
                      {hasClicks && (
                        <td
                          className={cc('cvr', 'source')}
                          {...metricInteractProps(() => toggleCompare(term, 'cvr', exact, 'source', hasClicks))}
                        >
                          {row.cvrPct != null ? `${row.cvrPct.toFixed(1)}%` : '—'}
                        </td>
                      )}
                      <td>
                        {(() => {
                          const v = sourceActualCpc(row)
                          return v != null ? `$${v.toFixed(2)}` : '—'
                        })()}
                      </td>
                      <td
                        className={cc('cpc', 'source')}
                        {...metricInteractProps(() => toggleCompare(term, 'cpc', exact, 'source', hasClicks))}
                      >
                        {(() => {
                          const c = suggestedCpcFromTargetAcos(
                            row.salesSum,
                            row.ordersSum,
                            row.clicksSum,
                            targetAcosForCpc
                          )
                          return c != null ? `$${c.toFixed(2)}` : '—'
                        })()}
                      </td>
                      <td
                        className={cc(
                          'clicks',
                          'ref',
                          `auto-exact-td-ref auto-exact-td-ref--edge${!exact ? ' auto-exact-cell--metric--disabled' : ''}`
                        )}
                        {...(exact ? metricInteractProps(() => toggleCompare(term, 'clicks', exact, 'ref', hasClicks)) : {})}
                      >
                        {exact != null ? exact.clicks : '—'}
                      </td>
                      <td
                        className={cc('orders', 'ref', `auto-exact-td-ref${!exact ? ' auto-exact-cell--metric--disabled' : ''}`)}
                        {...(exact ? metricInteractProps(() => toggleCompare(term, 'orders', exact, 'ref', hasClicks)) : {})}
                      >
                        {exact != null ? exact.orders : '—'}
                      </td>
                      <td
                        className={cc('acos', 'ref', `auto-exact-td-ref${!exact ? ' auto-exact-cell--metric--disabled' : ''}`)}
                        {...(exact ? metricInteractProps(() => toggleCompare(term, 'acos', exact, 'ref', hasClicks)) : {})}
                      >
                        {exact != null ? `${exact.acosPct.toFixed(1)}%` : '—'}
                      </td>
                      <td className={`auto-exact-td-ref${!exact ? ' auto-exact-cell--metric--disabled' : ''}`}>
                        {exact != null ? formatRoas(exact.roas) : '—'}
                      </td>
                      {hasClicks && (
                        <td
                          className={cc('cvr', 'ref', `auto-exact-td-ref${!exact ? ' auto-exact-cell--metric--disabled' : ''}`)}
                          {...(exact ? metricInteractProps(() => toggleCompare(term, 'cvr', exact, 'ref', hasClicks)) : {})}
                        >
                          {exact != null && exact.cvrPct != null ? `${exact.cvrPct.toFixed(1)}%` : '—'}
                        </td>
                      )}
                      <td className={`auto-exact-td-ref${!exact ? ' auto-exact-cell--metric--disabled' : ''}`}>
                        {(() => {
                          const v = referenceActualCpc(exact)
                          return v != null ? `$${v.toFixed(2)}` : '—'
                        })()}
                      </td>
                      <td className="auto-exact-td-performance">
                        {exact != null ? getPerformanceLabel(row, exact, row.primaryMatchType) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h3 id="review-queue-heading">Review queue (borderline)</h3>
        <p className="panel-desc">Terms that nearly qualify — ACoS within +10% of max or orders = min−1 with decent sales.</p>
        {reviewQueue.length === 0 ? (
          <p className="muted">None.</p>
        ) : (
          <div className="table-wrap table-wrap--compact table-wrap--review" role="region" aria-labelledby="review-queue-heading" tabIndex={-1}>
            <table className="results-table results-table--compact results-table--review">
              <caption className="sr-only">
                Borderline terms that nearly qualify for promotion. Read-only summary.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Term</th>
                  <th scope="col">Campaign(s)</th>
                  <th scope="col">Orders</th>
                  <th scope="col">Sales</th>
                  <th scope="col">Spend</th>
                  <th scope="col">ACoS</th>
                  <th scope="col">ROAS</th>
                  {hasClicks && <th scope="col">Clicks</th>}
                  {hasClicks && <th scope="col">CVR</th>}
                  <th scope="col">Curr. CPC</th>
                  <th scope="col">CPC ({targetAcosForCpc}%)</th>
                </tr>
              </thead>
              <tbody>
                {reviewQueue.map((row, i) => (
                  <tr key={`review-${row.normalizedTerm}-${i}`}>
                    <td className="results-table__keyword" title={row.originalTerm}>
                      {row.originalTerm}
                    </td>
                    <td title={row.campaignNames.join(', ')}>
                      {row.campaignNames.length > 0 ? row.campaignNames.join(', ') : '—'}
                    </td>
                    <td>{row.ordersSum}</td>
                    <td>{row.salesSum.toFixed(2)}</td>
                    <td>{row.spendSum.toFixed(2)}</td>
                    <td>{row.acosPct.toFixed(1)}%</td>
                    <td>{formatRoas(row.roas)}</td>
                    {hasClicks && <td>{row.clicksSum}</td>}
                    {hasClicks && <td>{row.cvrPct != null ? `${row.cvrPct.toFixed(1)}%` : '—'}</td>}
                    <td>
                      {(() => {
                        const v = sourceActualCpc(row)
                        return v != null ? `$${v.toFixed(2)}` : '—'
                      })()}
                    </td>
                    <td>
                      {(() => {
                        const c = suggestedCpcFromTargetAcos(
                          row.salesSum,
                          row.ordersSum,
                          row.clicksSum,
                          targetAcosForCpc
                        )
                        return c != null ? `$${c.toFixed(2)}` : '—'
                      })()}
                    </td>
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
