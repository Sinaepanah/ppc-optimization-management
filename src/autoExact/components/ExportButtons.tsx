interface ExportButtonsProps {
  wrapInBrackets: boolean
  onWrapInBracketsChange: (v: boolean) => void
  intent: string
  onIntentChange: (v: string) => void
  asin: string
  onAsinChange: (v: string) => void
  targetAcosForCpc: number
  onTargetAcosForCpcChange: (v: number) => void
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
        <p className="auto-exact-export-hint">Suggested CPC = (Target ACoS% × Sales) ÷ Clicks. Used in the results table.</p>
      </div>
      <div className="auto-exact-export-option">
        <label>
          <input type="checkbox" checked={wrapInBrackets} onChange={(e) => onWrapInBracketsChange(e.target.checked)} />
          Wrap exact keywords in brackets [term] <span className="muted">(when not using campaign title format)</span>
        </label>
      </div>
    </section>
  )
}
