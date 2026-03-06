import { useState, useCallback, type FC } from 'react'
import { getColumnOptions, detectSearchTermColumn } from '../utils/csv'
import { normalize } from '../utils/normalize'

interface CsvUploadModalProps {
  rows: string[][]
  onConfirm: (terms: string[]) => void
  onCancel: () => void
}

export const CsvUploadModal: FC<CsvUploadModalProps> = ({ rows, onConfirm, onCancel }) => {
  const [selectedIndex, setSelectedIndex] = useState(() =>
    rows.length ? detectSearchTermColumn(rows[0]) : 0
  )
  const options = getColumnOptions(rows)
  const suggested = rows.length ? detectSearchTermColumn(rows[0]) : 0

  const extractTerms = useCallback((r: string[][], col: number): string[] => {
    const terms: string[] = []
    for (let i = 1; i < r.length; i++) {
      const cell = r[i][col]?.trim() ?? ''
      const n = normalize(cell)
      if (n) terms.push(cell)
    }
    const seen = new Set<string>()
    const unique: string[] = []
    for (const t of terms) {
      const n = normalize(t)
      if (n && !seen.has(n)) {
        seen.add(n)
        unique.push(t)
      }
    }
    return unique
  }, [])

  const handleUseColumn = useCallback(() => {
    const terms = extractTerms(rows, selectedIndex)
    onConfirm(terms)
  }, [rows, selectedIndex, extractTerms, onConfirm])

  return (
    <div className="csv-column-selector">
      <div className="csv-column-selector__actions">
        <button type="button" onClick={onCancel} className="btn btn--secondary">Cancel</button>
        <button type="button" className="btn btn--primary" onClick={handleUseColumn}>
          Use this column
        </button>
      </div>
      <p className="csv-column-selector__hint">Select the column that contains search terms:</p>
      <div className="csv-column-selector__list">
        {options.map((label, i) => (
          <label key={i} className="csv-column-selector__option">
            <input
              type="radio"
              name="csvColumn"
              checked={selectedIndex === i}
              onChange={() => setSelectedIndex(i)}
            />
            <span>{label || `Column ${i + 1}`}</span>
            {i === suggested && <span className="csv-column-selector__suggested"> (suggested)</span>}
          </label>
        ))}
      </div>
    </div>
  )
}
