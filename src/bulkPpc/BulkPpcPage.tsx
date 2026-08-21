import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { Upload, Download, ChevronUp, ChevronDown } from 'lucide-react'
import { parseKeywordCsv } from './utils/keywordCsvParser'
import { optimizeBulk } from './utils/bulkOptimizer'
import { NumberInputWithArrows } from '../ppcTool/components/NumberInputWithArrows'
import { isSupportedTabularFile, readEncodedTextFile, TABULAR_UPLOAD_ACCEPT } from '../utils/readEncodedTextFile'
import {
  bulkKeywordsToCsv,
  extractScreenshotViaVision,
  type BulkKeywordExtractRow,
} from '../ppcTool/utils/visionExtract'
import './BulkPpc.css'

const UPLOAD_ACCEPT = `${TABULAR_UPLOAD_ACCEPT},image/*`

function getClipboardImage(e: ClipboardEvent): File | null {
  const items = e.clipboardData?.items
  if (items) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item?.type?.startsWith('image/')) {
        const f = item.getAsFile()
        if (f) return f
      }
    }
  }
  const fromFiles = e.clipboardData?.files?.[0]
  if (fromFiles?.type.startsWith('image/')) return fromFiles
  return null
}

export function BulkPpcPage() {
  const [csvText, setCsvText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [targetAcos, setTargetAcos] = useState('35')
  const [fileError, setFileError] = useState<string | null>(null)
  const [pasteSelected, setPasteSelected] = useState(false)
  const [imageStatus, setImageStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
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

  const runImageExtract = useCallback(async (file: File) => {
    setImageStatus('loading')
    setFileError(null)
    try {
      const data = (await extractScreenshotViaVision(file, 'bulkKeywords')) as {
        keywords: BulkKeywordExtractRow[]
      }
      const keywords = Array.isArray(data?.keywords) ? data.keywords : []
      if (keywords.length === 0) {
        throw new Error('No keywords found in screenshot')
      }
      setCsvText(bulkKeywordsToCsv(keywords))
      setFileName(file.name || 'screenshot-extract.csv')
      setImageStatus('done')
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Screenshot extract failed')
      setImageStatus('error')
    }
  }, [])

  const ingestFile = useCallback(
    async (file: File) => {
      if (file.type.startsWith('image/')) {
        await runImageExtract(file)
        return
      }
      if (!isSupportedTabularFile(file)) {
        setFileError('Please select a CSV, Excel, or screenshot image')
        return
      }
      try {
        const text = await readEncodedTextFile(file)
        setCsvText(text)
        setFileName(file.name)
        setFileError(null)
        setImageStatus('idle')
      } catch {
        setFileError('Failed to read file')
      }
    },
    [runImageExtract]
  )

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      await ingestFile(file)
      e.target.value = ''
    },
    [ingestFile]
  )

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setPasteSelected(true)
      const file = e.dataTransfer.files[0]
      if (file) await ingestFile(file)
    },
    [ingestFile]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => e.preventDefault(), [])

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return
      if (!pasteSelected) return
      const file = getClipboardImage(e)
      if (!file) return
      e.preventDefault()
      void runImageExtract(file)
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [pasteSelected, runImageExtract])

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
          Upload an Amazon keyword report CSV, or click the box and paste (Ctrl+V) / drop a screenshot.
          Each row is one keyword. Missing Spend/Sales/ACOS are calculated when possible. Suggested bids use Target ACoS.
        </p>

        <div
          className={`bulk-ppc-upload ${pasteSelected ? 'bulk-ppc-upload--selected' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => setPasteSelected(true)}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={UPLOAD_ACCEPT}
            onChange={handleFileChange}
            className="bulk-ppc-upload-input"
          />
          {imageStatus === 'loading' ? (
            <div className="bulk-ppc-upload-content">
              <p className="bulk-ppc-upload-title">Reading screenshot…</p>
              <p className="bulk-ppc-upload-hint">Extracting keywords with vision (same as Exact Bid Tools)</p>
            </div>
          ) : (
            <div className="bulk-ppc-upload-content">
              <Upload className="bulk-ppc-upload-icon" aria-hidden />
              <p className="bulk-ppc-upload-title">
                {fileName ? fileName : 'Drop CSV / screenshot, or click then Ctrl+V to paste'}
              </p>
              {pasteSelected && (
                <p className="bulk-ppc-upload-hint" style={{ fontWeight: 600 }}>
                  Paste target active (Ctrl+V)
                </p>
              )}
              <p className="bulk-ppc-upload-hint">
                CSV/Excel keyword report, or Amazon Ads keyword table screenshot
              </p>
              <button
                type="button"
                className="bulk-ppc-browse-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  setPasteSelected(true)
                  fileInputRef.current?.click()
                }}
              >
                Browse
              </button>
            </div>
          )}
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
