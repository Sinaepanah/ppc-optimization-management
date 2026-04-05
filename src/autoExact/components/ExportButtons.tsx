import type { ReactNode } from 'react'

interface ExportButtonsProps {
  wrapInBrackets: boolean
  onWrapInBracketsChange: (v: boolean) => void
  intent: string
  onIntentChange: (v: string) => void
  asin: string
  onAsinChange: (v: string) => void
  targetAcosForCpc: number
  onTargetAcosForCpcChange: (v: number) => void
  /** Shown below wrap checkbox when wrap is on (e.g. BracketKeywordCopyTable) */
  bracketCopySection?: ReactNode
}

export function ExportButtons({
  wrapInBrackets,
  onWrapInBracketsChange,
  intent,
  onIntentChange,
  asin,
  onAsinChange,
  targetAcosForCpc,
  onTargetAcosForCpcChange,
  bracketCopySection,
}: ExportButtonsProps) {
  const useCampaignFormat = intent.trim() !== '' && asin.trim() !== ''

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
          <p className="auto-exact-export-hint">Copy table uses campaign title format for each selected keyword.</p>
        )}
        <div className="auto-exact-export-option auto-exact-export-option--in-campaign">
          <label>
            <input type="checkbox" checked={wrapInBrackets} onChange={(e) => onWrapInBracketsChange(e.target.checked)} />
            Show copy table{' '}
            <span className="muted">
              ([term] or campaign title when INTENT and ASIN are filled)
            </span>
          </label>
        </div>
      </div>

      {wrapInBrackets && bracketCopySection}

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
        <p className="auto-exact-export-hint">
          Suggested max CPC = Target ACoS × AOV × min(CVR, 100%): AOV = Sales ÷ Orders, CVR = Orders ÷ Clicks. If orders exceed clicks (attribution),
          CVR is capped so the bid matches usual max-CPC practice. Same formula in the results table.
        </p>
      </div>
    </section>
  )
}
