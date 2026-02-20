import type { FC } from 'react'
import { getColumnOptions, detectSearchTermColumn } from '../utils/csv'

interface CSVColumnSelectorProps {
  rows: string[][]
  selectedIndex: number
  onSelect: (index: number) => void
  onConfirm: () => void
  onCancel: () => void
}

export const CSVColumnSelector: FC<CSVColumnSelectorProps> = ({
  rows,
  selectedIndex,
  onSelect,
  onConfirm,
  onCancel,
}) => {
  const options = getColumnOptions(rows)
  const suggested = rows.length ? detectSearchTermColumn(rows[0]) : 0

  return (
    <div className="csv-column-selector">
      <p className="csv-column-selector__hint">Select the column that contains search terms:</p>
      <div className="csv-column-selector__list">
        {options.map((label, i) => (
          <label key={i} className="csv-column-selector__option">
            <input
              type="radio"
              name="csvColumn"
              checked={selectedIndex === i}
              onChange={() => onSelect(i)}
            />
            <span>{label || `Column ${i + 1}`}</span>
            {i === suggested && <span className="csv-column-selector__suggested"> (suggested)</span>}
          </label>
        ))}
      </div>
      <div className="csv-column-selector__actions">
        <button type="button" onClick={onCancel} className="btn btn--secondary">Cancel</button>
        <button type="button" onClick={onConfirm} className="btn btn--primary">Use this column</button>
      </div>
    </div>
  )
}
