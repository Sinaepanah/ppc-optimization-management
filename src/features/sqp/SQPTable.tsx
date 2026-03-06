import { useState, useMemo, type FC } from 'react'
import type { StrategyRow } from './sqpStrategies'
import type { SQPRowWithMetrics } from './sqpMetrics'

type SortKey =
  | 'query'
  | 'searchVolume'
  | 'impressions'
  | 'clicks'
  | 'purchases'
  | 'cartAdds'
  | 'marketPurchases'
  | 'purchaseRate'
  | 'cartAddRate'
  | 'ctr'
  | 'impressionShare'
  | 'clickShare'
  | 'purchaseShare'
  | 'opportunityScore'
  | 'leakScore'
  | 'profitScore'
  | 'recommended'

interface SQPTableProps {
  rows: StrategyRow[]
  strategyId: string
}

const NUM_COLS: SortKey[] = [
  'searchVolume',
  'impressions',
  'clicks',
  'purchases',
  'cartAdds',
  'marketPurchases',
  'purchaseRate',
  'cartAddRate',
  'ctr',
  'impressionShare',
  'clickShare',
  'purchaseShare',
  'opportunityScore',
  'leakScore',
  'profitScore',
]

const COL_LABELS: Record<SortKey, string> = {
  query: 'Search Query',
  searchVolume: 'Search Vol',
  impressions: 'Impressions (ASIN)',
  clicks: 'Clicks (ASIN)',
  purchases: 'Purchases (ASIN)',
  cartAdds: 'Cart Adds (ASIN)',
  marketPurchases: 'Market Purchases',
  purchaseRate: 'Purchase Rate',
  cartAddRate: 'Cart Add Rate',
  ctr: 'CTR',
  impressionShare: 'Imp. Share',
  clickShare: 'Click Share',
  purchaseShare: 'Purchase Share',
  opportunityScore: 'Opportunity',
  leakScore: 'Leak Score',
  profitScore: 'Profit Score',
  recommended: 'Recommended PPC',
}

function fmtNum(n: number, pct = false): string {
  if (pct) return `${(n * 100).toFixed(1)}%`
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

export const SQPTable: FC<SQPTableProps> = ({ rows, strategyId }) => {
  const [sortKey, setSortKey] = useState<SortKey>('query')
  const [sortAsc, setSortAsc] = useState(true)

  const sorted = useMemo(() => {
    const arr = [...rows]
    arr.sort((a, b) => {
      let va: string | number
      let vb: string | number
      if (sortKey === 'query') {
        va = a.row.query.toLowerCase()
        vb = b.row.query.toLowerCase()
      } else if (sortKey === 'recommended') {
        va = a.recommended
        vb = b.recommended
      } else {
        va = (a.row as SQPRowWithMetrics)[sortKey as keyof SQPRowWithMetrics]
        vb = (b.row as SQPRowWithMetrics)[sortKey as keyof SQPRowWithMetrics]
        if (typeof va !== 'number') va = 0
        if (typeof vb !== 'number') vb = 0
      }
      if (va < vb) return sortAsc ? -1 : 1
      if (va > vb) return sortAsc ? 1 : -1
      return 0
    })
    return arr
  }, [rows, sortKey, sortAsc])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((a) => !a)
    else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

  const visibleCols = useMemo(() => {
    let base: SortKey[]
    if (strategyId === 'overview') {
      base = ['query', 'impressions', 'clicks', 'cartAdds', 'searchVolume', 'purchases', 'purchaseRate', 'ctr']
    } else if (strategyId === 'defendWinners') {
      base = ['query', 'impressions', 'clicks', 'cartAdds', 'purchases', 'purchaseShare', 'purchaseRate']
    } else if (strategyId === 'scaleConverters') {
      base = ['query', 'impressions', 'clicks', 'cartAdds', 'purchases', 'purchaseRate', 'ctr']
    } else if (strategyId === 'visibilityGaps') {
      base = ['query', 'impressions', 'cartAdds', 'marketPurchases', 'impressionShare', 'opportunityScore']
    } else if (strategyId === 'clickLeak') {
      base = ['query', 'impressions', 'clicks', 'cartAdds', 'clickShare', 'purchaseShare', 'leakScore']
    } else if (strategyId === 'cartAddFriction') {
      base = ['query', 'impressions', 'clicks', 'cartAdds', 'cartAddRate', 'purchaseRate']
    } else if (strategyId === 'keywordScoring') {
      base = ['query', 'impressions', 'clicks', 'cartAdds', 'searchVolume', 'purchaseRate', 'purchaseShare', 'profitScore']
    } else {
      base = ['query', 'impressions', 'clicks', 'cartAdds', 'purchases', 'purchaseRate', 'ctr']
    }
    base.push('recommended')
    return base
  }, [strategyId])

  const hasTags = rows.some((r) => r.tags.length > 0)

  const isPct = (k: SortKey) =>
    ['purchaseRate', 'cartAddRate', 'ctr', 'impressionShare', 'clickShare', 'purchaseShare'].includes(k)

  if (rows.length === 0) return null

  return (
    <div className="sqp-table-wrap">
      <table className="sqp-table">
        <thead>
          <tr>
            {visibleCols.map((key) => (
              <th
                key={key}
                className={`sqp-table__th ${key === 'query' ? 'sqp-table__th--pin' : ''}`}
              >
                <button
                  type="button"
                  className="sqp-table__sort"
                  onClick={() => handleSort(key)}
                >
                  {COL_LABELS[key]}
                  {sortKey === key && (
                    <span className="sqp-table__sort-icon">{sortAsc ? '↑' : '↓'}</span>
                  )}
                </button>
              </th>
            ))}
            {hasTags && <th className="sqp-table__th">Tags</th>}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={i}>
              {visibleCols.map((key) => (
                <td
                  key={key}
                  className={`sqp-table__td ${key === 'query' ? 'sqp-table__td--pin' : ''}`}
                >
                  {key === 'query' && <span className="sqp-table__query">{r.row.query}</span>}
                  {key === 'recommended' && (
                    <span className="sqp-table__rec">{r.recommended}</span>
                  )}
                  {key !== 'query' && key !== 'recommended' && (
                    <>
                      {NUM_COLS.includes(key)
                        ? fmtNum(
                            (() => {
                              const v = (r.row as SQPRowWithMetrics)[key as keyof SQPRowWithMetrics]
                              return typeof v === 'number' && !isNaN(v) ? v : 0
                            })(),
                            isPct(key)
                          )
                        : '-'}
                    </>
                  )}
                </td>
              ))}
              {hasTags && (
                <td className="sqp-table__td">
                  {r.tags.map((t) => (
                    <span key={t} className="sqp-table__tag">
                      {t}
                    </span>
                  ))}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
