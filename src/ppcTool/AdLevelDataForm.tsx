import { NumberInputWithArrows, type FieldType } from './components/NumberInputWithArrows'

const FIELDS: Array<{ key: string; label: string; prefix?: string; suffix?: string; type: FieldType }> = [
  { key: 'bid', label: 'Bid', prefix: '$', type: 'currency' },
  { key: 'impressions', label: 'Impressions', type: 'integer' },
  { key: 'clicks', label: 'Clicks', type: 'integer' },
  { key: 'totalCost', label: 'Total Cost', prefix: '$', type: 'currency' },
  { key: 'cpc', label: 'CPC', prefix: '$', type: 'currency' },
  { key: 'purchases', label: 'Purchases', type: 'integer' },
  { key: 'sales', label: 'Sales', prefix: '$', type: 'currency' },
  { key: 'acos', label: 'ACOS', suffix: '%', type: 'percent' },
]

interface AdLevelDataFormProps {
  values: Record<string, string>
  onDataChange: (data: Record<string, string>) => void
}

export function AdLevelDataForm({ values, onDataChange }: AdLevelDataFormProps) {
  const updateField = (key: string, value: string) => {
    const next = { ...values, [key]: value }
    onDataChange(next)
  }

  const handleClear = () => {
    const empty: Record<string, string> = {}
    for (const f of FIELDS) empty[f.key] = ''
    onDataChange(empty)
  }

  return (
    <div className="ppc-extracted-form ppc-extracted-form--full-width">
      <div className="ppc-form-header">
        <h3>Extracted data</h3>
        <button type="button" className="ppc-clear-btn" onClick={handleClear} aria-label="Clear data">
          Clear data
        </button>
      </div>
      <p className="ppc-form-hint">Review and correct values as needed.</p>
      <div className="ppc-fields">
        {FIELDS.map(({ key, label, prefix, suffix, type }) => (
          <div key={key} className="ppc-field">
            <label htmlFor={`ppc-ad-${key}`}>{label}</label>
            <NumberInputWithArrows
              id={`ppc-ad-${key}`}
              value={values[key] ?? ''}
              onChange={(v) => updateField(key, v)}
              type={type}
              prefix={prefix}
              suffix={suffix}
              placeholder="—"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
