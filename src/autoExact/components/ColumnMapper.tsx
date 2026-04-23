import type { ColumnMapping } from '../types'
import { getColumnOptions, getRequiredMissing } from '../utils/csvHelpers'

interface ColumnMapperProps {
  rows: string[][]
  mapping: ColumnMapping
  onMappingChange: (m: ColumnMapping) => void
  missingRequired: string[]
  includePhrase: string
  excludePhrase: string
  onIncludePhraseChange: (value: string) => void
  onExcludePhraseChange: (value: string) => void
}

const FIELDS: { key: keyof ColumnMapping; label: string; required: boolean }[] = [
  { key: 'searchTerm', label: 'Search Term', required: true },
  { key: 'spend', label: 'Spend', required: true },
  { key: 'sales', label: 'Sales', required: true },
  { key: 'orders', label: 'Orders', required: true },
  { key: 'roas', label: 'ROAS (optional)', required: false },
  { key: 'clicks', label: 'Clicks', required: false },
  { key: 'impressions', label: 'Impressions', required: false },
  { key: 'cpc', label: 'CPC', required: false },
  { key: 'campaignName', label: 'Campaign Name', required: false },
  { key: 'adGroupName', label: 'Ad Group Name', required: false },
  { key: 'matchType', label: 'Match Type', required: false },
  { key: 'targeting', label: 'Targeting', required: false },
]

export function ColumnMapper({
  rows,
  mapping,
  onMappingChange,
  missingRequired,
  includePhrase,
  excludePhrase,
  onIncludePhraseChange,
  onExcludePhraseChange,
}: ColumnMapperProps) {
  const options = getColumnOptions(rows)
  const opts = [{ value: -1, label: '— Not mapped —' }, ...options.map((label, i) => ({ value: i, label }))]

  const set = (key: keyof ColumnMapping, value: number) => {
    onMappingChange({ ...mapping, [key]: value })
  }

  return (
    <section className="panel auto-exact-columns">
      <h3>Column mapping</h3>
      {missingRequired.length > 0 && (
        <div className="auto-exact-error" role="alert">
          Map these required columns: <strong>{missingRequired.join(', ')}</strong>
        </div>
      )}
      <div className="auto-exact-column-grid">
        {FIELDS.map(({ key, label, required }) => (
          <div key={key} className="auto-exact-column-row">
            <label htmlFor={`col-${key}`}>
              {label}
              {required && <span className="auto-exact-required"> *</span>}
            </label>
            <select
              id={`col-${key}`}
              value={mapping[key]}
              onChange={(e) => set(key, parseInt(e.target.value, 10))}
            >
              {opts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        ))}
        <div className="auto-exact-column-row">
          <label htmlFor="auto-exact-include-phrase">Include phrase (optional)</label>
          <input
            id="auto-exact-include-phrase"
            type="text"
            value={includePhrase}
            onChange={(e) => onIncludePhraseChange(e.target.value)}
            placeholder="Only show terms containing this phrase"
          />
        </div>
        <div className="auto-exact-column-row">
          <label htmlFor="auto-exact-exclude-phrase">Exclude phrase (optional)</label>
          <input
            id="auto-exact-exclude-phrase"
            type="text"
            value={excludePhrase}
            onChange={(e) => onExcludePhraseChange(e.target.value)}
            placeholder="Hide terms containing this phrase"
          />
        </div>
      </div>
    </section>
  )
}

export function getMissingRequired(mapping: ColumnMapping): string[] {
  return getRequiredMissing(mapping)
}
