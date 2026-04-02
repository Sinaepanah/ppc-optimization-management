import { useCallback, useState } from 'react'
import { Copy } from 'lucide-react'
import type { ScoredTerm } from '../types'

function bracketExact(term: string): string {
  return `[${term}]`
}

interface BracketKeywordCopyTableProps {
  selectedTerms: ScoredTerm[]
}

export function BracketKeywordCopyTable({ selectedTerms }: BracketKeywordCopyTableProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const copyLine = useCallback((term: string, key: string) => {
    const text = bracketExact(term)
    void navigator.clipboard.writeText(text)
    setCopiedKey(key)
    window.setTimeout(() => setCopiedKey(null), 1600)
  }, [])

  return (
    <section className="panel auto-exact-bracket-copy">
      <h3>Exact keywords in brackets</h3>
      <p className="muted auto-exact-bracket-sub">Matches your selection in Promote to Exact.</p>
      {selectedTerms.length === 0 ? (
        <p className="muted">Select one or more rows in the Promote to Exact table.</p>
      ) : (
        <div className="table-wrap table-wrap--compact">
          <table className="results-table results-table--compact auto-exact-bracket-table">
            <thead>
              <tr>
                <th>Bracket exact keyword</th>
                <th className="auto-exact-bracket-copy-actions"> </th>
              </tr>
            </thead>
            <tbody>
              {selectedTerms.map((row, i) => {
                const line = bracketExact(row.originalTerm)
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
    </section>
  )
}
