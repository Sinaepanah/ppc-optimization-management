import type { FC } from 'react'

export type ExportFormat = 'plain' | 'exact' | 'negativePhrase'

interface ExportControlsProps {
  items: string[]
  format: ExportFormat
  onFormatChange: (format: ExportFormat) => void
  onCopy: () => void
  onExportCSV: () => void
  label?: string
  disabled?: boolean
}

const formatTerm = (term: string, format: ExportFormat): string => {
  switch (format) {
    case 'exact':
      return `[${term}]`
    case 'negativePhrase':
      return `"${term}"`
    default:
      return term
  }
}

export const ExportControls: FC<ExportControlsProps> = ({
  items,
  format,
  onFormatChange,
  onCopy,
  onExportCSV,
  label = 'Export',
  disabled = false,
}) => {
  const handleCopy = () => {
    const text = items.map((t) => formatTerm(t, format)).join('\n')
    void navigator.clipboard.writeText(text)
    onCopy()
  }

  const handleCSV = () => {
    const header = 'Keyword'
    const csv = [header, ...items.map((t) => `"${t.replace(/"/g, '""')}"`)].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'keywords.csv'
    a.click()
    URL.revokeObjectURL(url)
    onExportCSV()
  }

  return (
    <div className="export-controls">
      <span className="export-controls__label">{label}</span>
      <div className="export-controls__format">
        <label>
          <input
            type="radio"
            name="exportFormat"
            checked={format === 'plain'}
            onChange={() => onFormatChange('plain')}
          />
          Plain
        </label>
        <label>
          <input
            type="radio"
            name="exportFormat"
            checked={format === 'exact'}
            onChange={() => onFormatChange('exact')}
          />
          Exact [term]
        </label>
        <label>
          <input
            type="radio"
            name="exportFormat"
            checked={format === 'negativePhrase'}
            onChange={() => onFormatChange('negativePhrase')}
          />
          Negative phrase "term"
        </label>
      </div>
      <div className="export-controls__actions">
        <button type="button" className="btn btn--primary btn--small" onClick={handleCopy} disabled={disabled || items.length === 0}>
          Copy to clipboard
        </button>
        <button type="button" className="btn btn--secondary btn--small" onClick={handleCSV} disabled={disabled || items.length === 0}>
          Export CSV
        </button>
      </div>
    </div>
  )
}
