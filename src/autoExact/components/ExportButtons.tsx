import type { ScoredTerm } from '../types'

/** CPC that would achieve target ACoS: (targetAcosPct/100 * sales) / clicks */
function optimizedCpc(salesSum: number, clicksSum: number, targetAcosPct: number): number | null {
  if (clicksSum <= 0 || targetAcosPct <= 0) return null
  return (targetAcosPct / 100) * salesSum / clicksSum
}

interface ExportButtonsProps {
  /** Selected rows from Promote list (for export) */
  selectedPromoteList: ScoredTerm[]
  sourceCampaign: string
  wrapInBrackets: boolean
  onWrapInBracketsChange: (v: boolean) => void
  intent: string
  onIntentChange: (v: string) => void
  asin: string
  onAsinChange: (v: string) => void
  targetAcosForCpc: number
  onTargetAcosForCpcChange: (v: number) => void
  onCopyFeedback: () => void
}

function campaignTitleLine(intent: string, keyword: string, asin: string): string {
  return `(${intent.trim().toUpperCase()}) I ${keyword} I EXACT I SP I ${asin.trim()}`
}

export function ExportButtons({
  selectedPromoteList,
  sourceCampaign,
  wrapInBrackets,
  onWrapInBracketsChange,
  intent,
  onIntentChange,
  asin,
  onAsinChange,
  targetAcosForCpc,
  onTargetAcosForCpcChange,
  onCopyFeedback,
}: ExportButtonsProps) {
  const useCampaignFormat = intent.trim() !== '' && asin.trim() !== ''
  const exactKeywords = selectedPromoteList.map((r) =>
    useCampaignFormat
      ? campaignTitleLine(intent, r.originalTerm, asin)
      : wrapInBrackets
        ? `[${r.originalTerm}]`
        : r.originalTerm
  )
  const negativeTerms = selectedPromoteList.map((r) => r.originalTerm)

  const copyPromote = () => {
    const text = exactKeywords.join('\n')
    void navigator.clipboard.writeText(text)
    onCopyFeedback()
  }

  const exportPromoteCSV = () => {
    const header = useCampaignFormat
      ? 'campaign_title,keyword,match_type,suggested_cpc'
      : 'keyword,match_type,suggested_cpc'
    const rows = selectedPromoteList.map((r) => {
      const keyword = wrapInBrackets && !useCampaignFormat ? `[${r.originalTerm}]` : r.originalTerm
      const title = useCampaignFormat ? campaignTitleLine(intent, r.originalTerm, asin) : ''
      const cpcVal = optimizedCpc(r.salesSum, r.clicksSum, targetAcosForCpc)
      const cpc = cpcVal != null ? cpcVal.toFixed(2) : ''
      if (useCampaignFormat) {
        return `"${title.replace(/"/g, '""')}","${keyword.replace(/"/g, '""')}",exact,${cpc}`
      }
      return `"${keyword.replace(/"/g, '""')}",exact,${cpc}`
    })
    const csv = [header, ...rows].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'promote-to-exact.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const copyNegative = () => {
    const text = negativeTerms.join('\n')
    void navigator.clipboard.writeText(text)
    onCopyFeedback()
  }

  const exportNegativeCSV = () => {
    const header = 'negative_keyword,match_type,source_campaign,reason'
    const rows = selectedPromoteList.map(
      (r) =>
        `"${r.originalTerm.replace(/"/g, '""')}",negative exact,"${(sourceCampaign || 'Source').replace(/"/g, '""')}",Promote to Exact`
    )
    const csv = [header, ...rows].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'negative-exact-to-source.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const disabled = selectedPromoteList.length === 0

  return (
    <section className="panel auto-exact-export">
      <h3>Export</h3>
      <div className="auto-exact-export-campaign-format">
        <p className="auto-exact-export-campaign-desc">
          Campaign title format: <code>(INTENT) I keyword I EXACT I SP I ASIN</code>
        </p>
        <div className="auto-exact-export-intent-asin">
          <div className="auto-exact-export-field">
            <label htmlFor="export-intent">INTENT</label>
            <input
              id="export-intent"
              type="text"
              value={intent}
              onChange={(e) => onIntentChange(e.target.value)}
              placeholder="e.g. WATER"
            />
          </div>
          <div className="auto-exact-export-field">
            <label htmlFor="export-asin">ASIN</label>
            <input
              id="export-asin"
              type="text"
              value={asin}
              onChange={(e) => onAsinChange(e.target.value)}
              placeholder="e.g. B0DV3ZG4N2"
            />
          </div>
        </div>
        {useCampaignFormat && (
          <p className="auto-exact-export-hint">Copy/Export will use campaign title format for each selected keyword.</p>
        )}
      </div>
      <div className="auto-exact-export-target-acos">
        <div className="auto-exact-export-field">
          <label htmlFor="export-target-acos">Target ACoS for suggested CPC %</label>
          <input
            id="export-target-acos"
            type="number"
            min={1}
            max={100}
            value={targetAcosForCpc}
            onChange={(e) => onTargetAcosForCpcChange(Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 37)))}
          />
        </div>
        <p className="auto-exact-export-hint">Suggested CPC = (Target ACoS% × Sales) ÷ Clicks. Used in table and CSV export.</p>
      </div>
      <div className="auto-exact-export-option">
        <label>
          <input type="checkbox" checked={wrapInBrackets} onChange={(e) => onWrapInBracketsChange(e.target.checked)} />
          Wrap exact keywords in brackets [term] <span className="muted">(when not using campaign title format)</span>
        </label>
      </div>
      <div className="export-controls auto-exact-export-actions">
        <span className="export-controls__label">Promote list</span>
        <div className="export-controls__actions">
          <button type="button" className="btn btn--secondary btn--small" onClick={copyPromote} disabled={disabled}>
            Copy Promote list (newline)
          </button>
          <button type="button" className="btn btn--secondary btn--small" onClick={exportPromoteCSV} disabled={disabled}>
            Export Promote CSV
          </button>
        </div>
      </div>
      <div className="export-controls auto-exact-export-actions">
        <span className="export-controls__label">Negative Exact to source</span>
        <div className="export-controls__actions">
          <button type="button" className="btn btn--secondary btn--small" onClick={copyNegative} disabled={disabled}>
            Copy Negative Exact list
          </button>
          <button type="button" className="btn btn--secondary btn--small" onClick={exportNegativeCSV} disabled={disabled}>
            Export Negative Exact CSV
          </button>
        </div>
      </div>
    </section>
  )
}
