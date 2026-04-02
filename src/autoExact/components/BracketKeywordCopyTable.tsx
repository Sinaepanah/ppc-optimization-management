import { useCallback, useMemo, useState } from 'react'
import { Copy } from 'lucide-react'
import type { ScoredTerm } from '../types'

function bracketExact(term: string): string {
  return `[${term}]`
}

function campaignTitleLine(intent: string, keyword: string, asin: string): string {
  return `(${intent.trim().toUpperCase()}) I ${keyword} I EXACT I SP I ${asin.trim()}`
}

interface BracketKeywordCopyTableProps {
  selectedTerms: ScoredTerm[]
  intent: string
  asin: string
  /** When true, render without outer panel chrome (nested inside Export) */
  embedded?: boolean
}

export function BracketKeywordCopyTable({
  selectedTerms,
  intent,
  asin,
  embedded = false,
}: BracketKeywordCopyTableProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const useCampaignFormat = useMemo(() => intent.trim() !== '' && asin.trim() !== '', [intent, asin])

  const lineForTerm = useCallback(
    (term: string) =>
      useCampaignFormat ? campaignTitleLine(intent, term, asin) : bracketExact(term),
    [intent, asin, useCampaignFormat]
  )

  const copyLine = useCallback(
    (term: string, key: string) => {
      const text = lineForTerm(term)
      void navigator.clipboard.writeText(text)
      setCopiedKey(key)
      window.setTimeout(() => setCopiedKey(null), 1600)
    },
    [lineForTerm]
  )

  const colLabel = useCampaignFormat ? 'Campaign title' : 'Bracket exact keyword'

  const inner = (
    <>
      {embedded ? <h4 className="auto-exact-bracket-copy-title">Copy lines</h4> : <h3>Exact keywords in brackets</h3>}
      <p className="muted auto-exact-bracket-sub">
        {useCampaignFormat
          ? 'Campaign title format for each selected Promote to Exact row.'
          : 'Bracket format for each selected Promote to Exact row.'}
      </p>
      {selectedTerms.length === 0 ? (
        <p className="muted">Select one or more rows in the Promote to Exact table below.</p>
      ) : (
        <div className="table-wrap table-wrap--compact">
          <table className="results-table results-table--compact auto-exact-bracket-table">
            <thead>
              <tr>
                <th>{colLabel}</th>
                <th className="auto-exact-bracket-copy-actions"> </th>
              </tr>
            </thead>
            <tbody>
              {selectedTerms.map((row, i) => {
                const line = lineForTerm(row.originalTerm)
                const key = `${row.normalizedTerm}-${i}`
                return (
                  <tr key={key}>
                    <td className="results-table__keyword">
                      <code className="auto-exact-bracket-code">{line}</code>
                    </td>
                    <td className="auto-exact-bracket-copy-actions">
                      <button
                        type="button"
                        className="btn btn--secondary btn--small"
                        onClick={() => copyLine(row.originalTerm, key)}
                        aria-label={`Copy ${line}`}
                      >
                        <Copy size={14} aria-hidden />
                        <span className="auto-exact-bracket-copy-btn-label">Copy</span>
                      </button>
                      {copiedKey === key && <span className="auto-exact-bracket-copied">Copied</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )

  if (embedded) {
    return <div className="auto-exact-bracket-copy auto-exact-bracket-copy--embedded">{inner}</div>
  }

  return <section className="panel auto-exact-bracket-copy">{inner}</section>
}
