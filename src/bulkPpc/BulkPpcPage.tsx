import { useState, useCallback, useMemo, useRef } from 'react'
import { Upload, Download, ChevronUp, ChevronDown } from 'lucide-react'
import { parseKeywordCsv } from './utils/keywordCsvParser'
import { optimizeBulk } from './utils/bulkOptimizer'
import { NumberInputWithArrows } from '../ppcTool/components/NumberInputWithArrows'
import './BulkPpc.css'

export function BulkPpcPage() {
  const [csvText, setCsvText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [targetAcos, setTargetAcos] = useState('35')
  const [fileError, setFileError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const parseResult = useMemo(() => {
    if (!csvText.trim()) return { result: null, error: null as string | null }
    try {
      const result = parseKeywordCsv(csvText)
      return { result: result.parseError ? null : result, error: result.parseError ?? null }
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : 'Failed to parse CSV' }
    }
  }, [csvText])

  const parsed = parseResult.result
  const displayError = parseResult.error ?? fileError

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setCsvText(String(reader.result ?? ''))
      setFileName(file.name)
      setFileError(null)
    }
    reader.onerror = () => setFileError('Failed to read file')
    reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file?.name.endsWith('.csv') || file?.type === 'text/csv' || file?.type === 'application/csv') {
      const reader = new FileReader()
      reader.onload = () => {
        setCsvText(String(reader.result ?? ''))
        setFileName(file.name)
        setFileError(null)
      }
      reader.readAsText(file, 'UTF-8')
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => e.preventDefault(), [])

  const targetAcosNum = parseFloat(targetAcos.replace(/[%,\s]/g, '')) || 35
  const optimizations = useMemo(() => {
    if (!parsed?.rows?.length) return []
    return optimizeBulk(parsed.rows, targetAcosNum)
  }, [parsed?.rows, targetAcosNum])

  type SortKey = 'keyword' | 'matchType' | 'currentBid' | 'suggestedBid' | 'changePercent' | 'status' | 'impressions' | 'clicks' | 'orders' | 'cvr' | 'spend' | 'sales' | 'acos'
  const [sortKey, setSortKey] = useState<SortKey>('keyword')
  const [sortAsc, setSortAsc] = useState(true)

  const sortedOptimizations = useMemo(() => {
    const arr = [...optimizations]
    arr.sort((a, b) => {
      let va: string | number
      let vb: string | number
      if (sortKey === 'keyword' || sortKey === 'matchType' || sortKey === 'status') {
        va = (a[sortKey] ?? '').toString().toLowerCase()
        vb = (b[sortKey] ?? '').toString().toLowerCase()
      } else {
        va = a[sortKey]
        vb = b[sortKey]
        if (typeof va !== 'number') va = 0
        if (typeof vb !== 'number') vb = 0
      }
      if (va < vb) return sortAsc ? -1 : 1
      if (va > vb) return sortAsc ? 1 : -1
      return 0
    })
    return arr
  }, [optimizations, sortKey, sortAsc])

  const handleSortClick = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortAsc((prev) => !prev)
    } else {
      setSortKey(key)
      setSortAsc(true)
    }
  }, [sortKey])

  const handleExportOptimized = useCallback(() => {
    if (!parsed || optimizations.length === 0) return
    const headers = [...parsed.headers, 'Suggested Bid', 'Change %', 'Status', 'Action', 'Reason']
    const optMap = new Map(optimizations.map((o) => [o.rowIndex, o]))
    const rows = parsed.rows.map((row, i) => {
      const opt = optMap.get(i)
      const rawValues = parsed.headers.map((h) => row.raw[h] ?? '')
      const suggested = opt ? opt.suggestedBid.toFixed(2) : ''
      const change = opt ? `${opt.changePercent >= 0 ? '+' : ''}${opt.changePercent.toFixed(1)}%` : ''
      const status = opt ? opt.status : ''
      const action = opt?.status === 'zero-sales-decrease' ? 'Decrease' : opt?.status === 'zero-sales-increase' ? 'Increase' : ''
      const reason = opt ? opt.rationale : ''
      return [...rawValues, suggested, change, status, action, reason]
    })
    const csv = [headers.join(','), ...rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bulk-ppc-optimized-${fileName ?? 'export'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [parsed, optimizations, fileName])

  const hasData = parsed && parsed.rows.length > 0

  return (
    <div className="bulk-ppc">
      <div className="panel">
        <h2>Bulk PPC Optimizer</h2>
        <p className="bulk-ppc-desc">
          Upload an Amazon keyword report CSV (Broad or Phrase campaigns). Each row is one keyword.
          The tool analyzes performance and suggests bid adjustments based on Target ACoS.
        </p>

        <div
          className="bulk-ppc-upload"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv,application/csv"
            onChange={handleFileChange}
            className="bulk-ppc-upload-input"
          />
          <div className="bulk-ppc-upload-content">
            <Upload className="bulk-ppc-upload-icon" aria-hidden />
            <p className="bulk-ppc-upload-title">
              {fileName ? fileName : 'Drop CSV or click to browse'}
            </p>
            <p className="bulk-ppc-upload-hint">
              Amazon keyword report with columns: Keyword, Bid, Impressions, Clicks, Spend, Sales, ACOS, etc.
            </p>
            <button
              type="button"
              className="bulk-ppc-browse-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              Browse
            </button>
          </div>
        </div>

        {displayError && <p className="bulk-ppc-error">{displayError}</p>}
      </div>

      {hasData && (
        <>
          <div className="panel bulk-ppc-controls-panel">
            <h3>Optimization Settings</h3>
            <div className="bulk-ppc-controls">
              <div className="ppc-field">
                <label htmlFor="bulk-target-acos">Target ACoS (%)</label>
                <NumberInputWithArrows
                  id="bulk-target-acos"
                  value={targetAcos}
                  onChange={setTargetAcos}
                  type="percent"
                  suffix="%"
                  placeholder="35"
                />
              </div>
              <button
                type="button"
                className="bulk-ppc-export-btn"
                onClick={handleExportOptimized}
              >
                <Download className="bulk-ppc-export-icon" aria-hidden />
                Export Optimized CSV
              </button>
            </div>
          </div>

          <div className="panel bulk-ppc-table-panel">
            <h3>Keywords & Optimization Results</h3>
            <p className="bulk-ppc-table-hint">
              {parsed.rows.length} keywords loaded. Suggested bids based on Target ACoS {targetAcosNum}%.
            </p>
            <div className="bulk-ppc-table-wrap">
              <table className="bulk-ppc-table">
                <thead>
                  <tr>
                    <th className="bulk-ppc-col-keyword bulk-ppc-th-sortable" onClick={() => handleSortClick('keyword')}>
                      <span className="bulk-ppc-th-inner">Keyword{sortKey === 'keyword' && (sortAsc ? <ChevronUp className="bulk-ppc-sort-icon" /> : <ChevronDown className="bulk-ppc-sort-icon" />)}</span>
                    </th>
                    <th className="bulk-ppc-col-match bulk-ppc-th-sortable" onClick={() => handleSortClick('matchType')}>
                      <span className="bulk-ppc-th-inner">Match{sortKey === 'matchType' && (sortAsc ? <ChevronUp className="bulk-ppc-sort-icon" /> : <ChevronDown className="bulk-ppc-sort-icon" />)}</span>
                    </th>
                    <th className="bulk-ppc-col-num bulk-ppc-th-sortable" onClick={() => handleSortClick('currentBid')}>
                      <span className="bulk-ppc-th-inner">Bid{sortKey === 'currentBid' && (sortAsc ? <ChevronUp className="bulk-ppc-sort-icon" /> : <ChevronDown className="bulk-ppc-sort-icon" />)}</span>
                    </th>
                    <th className="bulk-ppc-col-num bulk-ppc-th-sortable" onClick={() => handleSortClick('suggestedBid')}>
                      <span className="bulk-ppc-th-inner">New{sortKey === 'suggestedBid' && (sortAsc ? <ChevronUp className="bulk-ppc-sort-icon" /> : <ChevronDown className="bulk-ppc-sort-icon" />)}</span>
                    </th>
                    <th className="bulk-ppc-col-num bulk-ppc-th-sortable" onClick={() => handleSortClick('changePercent')}>
                      <span className="bulk-ppc-th-inner">Δ%{sortKey === 'changePercent' && (sortAsc ? <ChevronUp className="bulk-ppc-sort-icon" /> : <ChevronDown className="bulk-ppc-sort-icon" />)}</span>
                    </th>
                    <th className="bulk-ppc-col-status bulk-ppc-th-sortable" onClick={() => handleSortClick('status')}>
                      <span className="bulk-ppc-th-inner">Status{sortKey === 'status' && (sortAsc ? <ChevronUp className="bulk-ppc-sort-icon" /> : <ChevronDown className="bulk-ppc-sort-icon" />)}</span>
                    </th>
                    <th className="bulk-ppc-col-num bulk-ppc-th-sortable" onClick={() => handleSortClick('impressions')}>
                      <span className="bulk-ppc-th-inner">Impr{sortKey === 'impressions' && (sortAsc ? <ChevronUp className="bulk-ppc-sort-icon" /> : <ChevronDown className="bulk-ppc-sort-icon" />)}</span>
                    </th>
                    <th className="bulk-ppc-col-num bulk-ppc-th-sortable" onClick={() => handleSortClick('clicks')}>
                      <span className="bulk-ppc-th-inner">Clicks{sortKey === 'clicks' && (sortAsc ? <ChevronUp className="bulk-ppc-sort-icon" /> : <ChevronDown className="bulk-ppc-sort-icon" />)}</span>
                    </th>
                    <th className="bulk-ppc-col-num bulk-ppc-th-sortable" onClick={() => handleSortClick('orders')}>
                      <span className="bulk-ppc-th-inner">Ord{sortKey === 'orders' && (sortAsc ? <ChevronUp className="bulk-ppc-sort-icon" /> : <ChevronDown className="bulk-ppc-sort-icon" />)}</span>
                    </th>
                    <th className="bulk-ppc-col-num bulk-ppc-th-sortable" onClick={() => handleSortClick('cvr')}>
                      <span className="bulk-ppc-th-inner">CVR{sortKey === 'cvr' && (sortAsc ? <ChevronUp className="bulk-ppc-sort-icon" /> : <ChevronDown className="bulk-ppc-sort-icon" />)}</span>
                    </th>
                    <th className="bulk-ppc-col-num bulk-ppc-th-sortable" onClick={() => handleSortClick('spend')}>
                      <span className="bulk-ppc-th-inner">Spend{sortKey === 'spend' && (sortAsc ? <ChevronUp className="bulk-ppc-sort-icon" /> : <ChevronDown className="bulk-ppc-sort-icon" />)}</span>
                    </th>
                    <th className="bulk-ppc-col-num bulk-ppc-th-sortable" onClick={() => handleSortClick('sales')}>
                      <span className="bulk-ppc-th-inner">Sales{sortKey === 'sales' && (sortAsc ? <ChevronUp className="bulk-ppc-sort-icon" /> : <ChevronDown className="bulk-ppc-sort-icon" />)}</span>
                    </th>
                    <th className="bulk-ppc-col-num bulk-ppc-th-sortable" onClick={() => handleSortClick('acos')}>
                      <span className="bulk-ppc-th-inner">ACoS{sortKey === 'acos' && (sortAsc ? <ChevronUp className="bulk-ppc-sort-icon" /> : <ChevronDown className="bulk-ppc-sort-icon" />)}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedOptimizations.map((opt) => (
                    <tr key={opt.rowIndex} className={`bulk-ppc-row bulk-ppc-row--${opt.status}`}>
                      <td className="bulk-ppc-cell-keyword" title={opt.keyword}>{opt.keyword}</td>
                      <td className="bulk-ppc-cell-match">{opt.matchType ?? '—'}</td>
                      <td className="bulk-ppc-cell-num">${opt.currentBid.toFixed(2)}</td>
                      <td className="bulk-ppc-cell-suggested bulk-ppc-cell-num">
                        ${opt.suggestedBid.toFixed(2)}
                      </td>
                      <td className="bulk-ppc-cell-num">
                        <span
                          className={`bulk-ppc-change ${
                            opt.changePercent > 0 ? 'bulk-ppc-change--up' : opt.changePercent < 0 ? 'bulk-ppc-change--down' : ''
                          }`}
                        >
                          {opt.changePercent > 0 ? '+' : ''}
                          {opt.changePercent.toFixed(1)}%
                        </span>
                      </td>
                      <td className="bulk-ppc-cell-status" title={opt.rationale}>
                        <span className={`bulk-ppc-status bulk-ppc-status--${opt.status}`}>
                          {opt.status === 'zero-sales-decrease' ? 'Decrease' : opt.status === 'zero-sales-increase' ? 'Increase' : opt.status.replace(/-/g, ' ')}
                        </span>
                      </td>
                      <td className="bulk-ppc-cell-num">{opt.impressions.toLocaleString()}</td>
                      <td className="bulk-ppc-cell-num">{opt.clicks.toLocaleString()}</td>
                      <td className="bulk-ppc-cell-num">{opt.orders.toLocaleString()}</td>
                      <td className="bulk-ppc-cell-num">{opt.cvr > 0 ? `${opt.cvr.toFixed(1)}%` : '—'}</td>
                      <td className="bulk-ppc-cell-num">${opt.spend.toFixed(2)}</td>
                      <td className="bulk-ppc-cell-num">${opt.sales.toFixed(2)}</td>
                      <td className="bulk-ppc-cell-num">{opt.acos > 0 ? `${opt.acos.toFixed(1)}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
