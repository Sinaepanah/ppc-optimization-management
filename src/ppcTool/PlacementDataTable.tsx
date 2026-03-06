import type { ExtractedPlacementData } from './utils/placementParser'
import { NumberInputWithArrows, type FieldType } from './components/NumberInputWithArrows'

const PLACEMENT_ROW_KEYS: (keyof ExtractedPlacementData)[] = [
  'topOfSearch',
  'restOfSearch',
  'productPages',
]

const COLUMNS: Array<{ key: keyof import('./utils/placementParser').PlacementRow; label: string; prefix?: string; suffix?: string; type: FieldType }> = [
  { key: 'bidAdjustment', label: 'Bid adj.', suffix: '%', type: 'percentWhole' },
  { key: 'impressions', label: 'Impressions', type: 'integer' },
  { key: 'clicks', label: 'Clicks', type: 'integer' },
  { key: 'ctr', label: 'CTR', suffix: '%', type: 'percent' },
  { key: 'totalCost', label: 'Total cost', prefix: '$', type: 'currency' },
  { key: 'cpc', label: 'CPC', prefix: '$', type: 'currency' },
  { key: 'purchases', label: 'Purchases', type: 'integer' },
  { key: 'sales', label: 'Sales', prefix: '$', type: 'currency' },
  { key: 'acos', label: 'ACOS', suffix: '%', type: 'percent' },
]

interface PlacementDataTableProps {
  data: ExtractedPlacementData
  onDataChange: (data: ExtractedPlacementData | null) => void
}

export function PlacementDataTable({ data, onDataChange }: PlacementDataTableProps) {
  const updateCell = (
    rowKey: keyof ExtractedPlacementData,
    colKey: keyof import('./utils/placementParser').PlacementRow,
    value: string
  ) => {
    const row = data[rowKey]
    if (!row) return
    const next = {
      ...data,
      [rowKey]: { ...row, [colKey]: value },
    }
    onDataChange(next)
  }

  const handleClear = () => {
    onDataChange(null)
  }

  return (
    <div className="ppc-placement-results ppc-placement-results--full-width">
      <div className="ppc-form-header">
        <h3>Placement data</h3>
        <button type="button" className="ppc-clear-btn" onClick={handleClear} aria-label="Clear data">
          Clear data
        </button>
      </div>
      <p className="ppc-form-hint">Review and correct values. Each row is a placement type.</p>
      <div className="ppc-placement-table-wrap">
        <table className="ppc-placement-table">
          <thead>
            <tr>
              <th>Placement</th>
              {COLUMNS.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PLACEMENT_ROW_KEYS.map((rowKey) => {
              const row = data[rowKey] as import('./utils/placementParser').PlacementRow
              if (!row) return null
              return (
                <tr key={rowKey}>
                  <td className="ppc-placement-name">{row.placementName}</td>
                  {COLUMNS.map((col) => (
                    <td key={col.key}>
                      <NumberInputWithArrows
                        value={row[col.key] ?? ''}
                        onChange={(v) => updateCell(rowKey, col.key, v)}
                        type={col.type}
                        prefix={col.prefix}
                        suffix={col.suffix}
                        placeholder="—"
                      />
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
