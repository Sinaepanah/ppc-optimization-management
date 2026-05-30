import { useState, useCallback, useMemo, type ReactNode } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import type { Campaign, DuplicateResult } from '../types'
import {
  buildCampaignFromTerms,
  campaignsHaveMatchBreakdown,
  findCrossBatchDuplicates,
  findCrossCampaignDuplicates,
  findSingleSheetDuplicatesByCampaign,
  findWithinFileDuplicates,
  type SingleSheetDuplicateResult,
} from '../utils/deduplication'
import { LARGE_DATA_WARNING } from '../types'
import { ExportControls, type ExportFormat } from './ExportControls'
import { isSupportedTabularFile, readEncodedTextFile, TABULAR_UPLOAD_ACCEPT } from '../utils/readEncodedTextFile'

interface DeduplicationPanelProps {
  campaigns: Campaign[]
}

const CUSTOM_MANUAL_KEYWORDS_ID = '__custom_manual_keywords__'
const CUSTOM_MANUAL_KEYWORDS_LABEL = 'CUSTOM MANUAL KEYWORDS'
type ComparatorMode = 'min' | 'max' | 'eq'

export function DeduplicationPanel({ campaigns }: DeduplicationPanelProps) {
  const [dedupMode, setDedupMode] = useState<'campaigns' | 'batches'>('campaigns')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [minCampaigns, setMinCampaigns] = useState(2)
  const [exportFormat, setExportFormat] = useState<ExportFormat>('plain')
  const [copyFeedback, setCopyFeedback] = useState(false)
  const [manualKeywordText, setManualKeywordText] = useState('')
  const [singleSheetText, setSingleSheetText] = useState('')
  const [singleSheetFileName, setSingleSheetFileName] = useState('')
  const [singleSheetError, setSingleSheetError] = useState<string | null>(null)
  const [singleSheetLoading, setSingleSheetLoading] = useState(false)
  const [singleSheetMinCampaigns, setSingleSheetMinCampaigns] = useState(2)
  const [singleSheetMinClicks, setSingleSheetMinClicks] = useState(20)
  const [singleSheetMinImpressions, setSingleSheetMinImpressions] = useState('0')
  const [singleSheetMinOrders, setSingleSheetMinOrders] = useState('0')
  const [singleSheetOrdersRangeMin, setSingleSheetOrdersRangeMin] = useState('')
  const [singleSheetOrdersRangeMax, setSingleSheetOrdersRangeMax] = useState('')
  const [singleSheetClicksMode, setSingleSheetClicksMode] = useState<ComparatorMode>('min')
  const [singleSheetImprMode, setSingleSheetImprMode] = useState<ComparatorMode>('min')
  const [singleSheetSalesMode, setSingleSheetSalesMode] = useState<ComparatorMode>('min')

  const toggleCampaign = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    if (selectedIds.size === campaigns.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(campaigns.map((c) => c.id)))
  }, [campaigns, selectedIds.size])

  const selectedCampaigns = useMemo(
    () => campaigns.filter((c) => selectedIds.has(c.id)),
    [campaigns, selectedIds]
  )

  const manualKeywordCampaign = useMemo((): Campaign | null => {
    const lines = manualKeywordText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (lines.length === 0) return null
    const fromTerms = buildCampaignFromTerms(lines)
    return {
      id: CUSTOM_MANUAL_KEYWORDS_ID,
      name: CUSTOM_MANUAL_KEYWORDS_LABEL,
      bundleName: CUSTOM_MANUAL_KEYWORDS_LABEL,
      ...fromTerms,
    }
  }, [manualKeywordText])

  const dedupSources = useMemo(() => {
    const list = [...selectedCampaigns]
    if (manualKeywordCampaign) list.push(manualKeywordCampaign)
    return list
  }, [selectedCampaigns, manualKeywordCampaign])

  const totalTerms = useMemo(
    () => dedupSources.reduce((sum, c) => sum + c.terms.length, 0),
    [dedupSources]
  )

  const showLargeWarning = totalTerms >= LARGE_DATA_WARNING

  const dedupBatchCount = useMemo(() => {
    const keys = new Set<string>()
    for (const c of dedupSources) {
      keys.add(c.bundleName?.trim() || `__ungrouped:${c.id}`)
    }
    return keys.size
  }, [dedupSources])

  const isWithinFileMode = useMemo(() => {
    if (dedupSources.length === 0) return false
    if (dedupMode === 'batches') return dedupBatchCount === 1
    return dedupSources.length === 1
  }, [dedupSources.length, dedupMode, dedupBatchCount])

  const duplicates = useMemo(() => {
    if (dedupSources.length === 0) return []
    if (isWithinFileMode) {
      return findWithinFileDuplicates(dedupSources, minCampaigns)
    }
    if (dedupSources.length < 2) return []
    if (dedupMode === 'batches') {
      if (dedupBatchCount < 2) return []
      return findCrossBatchDuplicates(dedupSources, minCampaigns)
    }
    return findCrossCampaignDuplicates(dedupSources, minCampaigns)
  }, [dedupSources, minCampaigns, dedupMode, dedupBatchCount, isWithinFileMode])

  const needsReimportForWithinFile =
    isWithinFileMode && dedupSources.length > 0 && !campaignsHaveMatchBreakdown(dedupSources)

  const duplicateTerms = useMemo(() => duplicates.map((d) => d.normalizedTerm), [duplicates])

  const showCopyFeedback = useCallback(() => {
    setCopyFeedback(true)
    setTimeout(() => setCopyFeedback(false), 2000)
  }, [])

  const handleSingleSheetChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!isSupportedTabularFile(file)) {
      setSingleSheetError('Please select a CSV or Excel file')
      e.target.value = ''
      return
    }
    setSingleSheetLoading(true)
    setSingleSheetError(null)
    try {
      const text = await readEncodedTextFile(file)
      setSingleSheetText(text)
      setSingleSheetFileName(file.name)
    } catch {
      setSingleSheetError('Failed to read the file')
    } finally {
      setSingleSheetLoading(false)
      e.target.value = ''
    }
  }, [])

  const singleSheetResults = useMemo(() => {
    if (!singleSheetText.trim()) return []
    const base = findSingleSheetDuplicatesByCampaign(
      singleSheetText,
      Math.max(2, singleSheetMinCampaigns),
      0
    )
    const cmp = (value: number, threshold: number, mode: ComparatorMode): boolean => {
      if (mode === 'eq') return value === threshold
      if (mode === 'max') return value <= threshold
      return value >= threshold
    }
    const clicksThreshold = Math.max(0, singleSheetMinClicks)
    const minImpr = Math.max(0, parseFloat(singleSheetMinImpressions) || 0)
    const minOrders = Math.max(0, parseFloat(singleSheetMinOrders) || 0)
    const ordersRangeMin = singleSheetOrdersRangeMin.trim() === '' ? undefined : Math.max(0, parseFloat(singleSheetOrdersRangeMin) || 0)
    const ordersRangeMax = singleSheetOrdersRangeMax.trim() === '' ? undefined : Math.max(0, parseFloat(singleSheetOrdersRangeMax) || 0)
    const hasOrdersRange = ordersRangeMin !== undefined || ordersRangeMax !== undefined
    return base.filter(
      (r) => {
        const combinedOrders = r.totalPurchases
        const inOrdersRange =
          (ordersRangeMin === undefined || combinedOrders >= ordersRangeMin) &&
          (ordersRangeMax === undefined || combinedOrders <= ordersRangeMax)
        const passesOrders =
          hasOrdersRange
            ? inOrdersRange
            : cmp(combinedOrders, minOrders, singleSheetSalesMode)
        return (
        cmp(r.totalClicks, clicksThreshold, singleSheetClicksMode) &&
        cmp(r.totalImpressions, minImpr, singleSheetImprMode) &&
        passesOrders
        )
      }
    )
  }, [
    singleSheetText,
    singleSheetMinCampaigns,
    singleSheetMinClicks,
    singleSheetMinImpressions,
    singleSheetMinOrders,
    singleSheetClicksMode,
    singleSheetImprMode,
    singleSheetSalesMode,
    singleSheetOrdersRangeMin,
    singleSheetOrdersRangeMax,
  ])

  return (
    <section className="panel deduplication-panel">
      <h2>Cross-campaign deduplication</h2>
      <p className="panel-desc">
        Select 1 or more campaigns to find search terms that repeat. With a <strong>single file</strong>, the app finds the same customer search term matched by multiple <strong>Keywords</strong> rows. With multiple files, use <strong>As is</strong> to compare each upload or <strong>Batch mode</strong> to merge metrics per bundle name from Campaign Input. Each duplicate term uses one block of rows, then a combined totals row with blended <strong>ACOS</strong> when your CSVs include spend and attributed sales. Excel exports often use UTF-16 or semicolon separators — both are supported. Re-import files after app updates so metrics refresh.
      </p>

      {campaigns.length === 0 ? (
        <p className="muted">Add campaigns in the Campaign Input tab first.</p>
      ) : (
        <>
          <div className="dedup-select">
            <fieldset className="dedup-mode-fieldset">
              <legend className="dedup-mode-legend">Comparison mode</legend>
              <div className="dedup-mode-options">
                <label className="dedup-mode-option">
                  <input
                    type="radio"
                    name="dedup-mode"
                    checked={dedupMode === 'campaigns'}
                    onChange={() => setDedupMode('campaigns')}
                  />
                  <span>As is (per file)</span>
                </label>
                <label className="dedup-mode-option">
                  <input
                    type="radio"
                    name="dedup-mode"
                    checked={dedupMode === 'batches'}
                    onChange={() => setDedupMode('batches')}
                  />
                  <span>Batch mode (aggregate per bundle)</span>
                </label>
              </div>
            </fieldset>
            <div className="dedup-manual-keywords">
              <label className="dedup-manual-keywords__label" htmlFor="dedup-manual-keywords-input">
                {CUSTOM_MANUAL_KEYWORDS_LABEL}
              </label>
              <textarea
                id="dedup-manual-keywords-input"
                className="dedup-manual-keywords__textarea"
                rows={5}
                spellCheck={false}
                autoComplete="off"
                placeholder="One keyword per line (same normalization as uploaded search terms). Counts as an extra source alongside the files you select."
                value={manualKeywordText}
                onChange={(e) => setManualKeywordText(e.target.value)}
              />
              {manualKeywordCampaign && (
                <p className="dedup-manual-keywords__meta muted">
                  {manualKeywordCampaign.terms.length} term
                  {manualKeywordCampaign.terms.length === 1 ? '' : 's'} — one extra source named{' '}
                  {CUSTOM_MANUAL_KEYWORDS_LABEL}.
                </p>
              )}
            </div>
            <div className="dedup-select__campaigns">
              <button type="button" className="btn btn--primary btn--small" onClick={selectAll}>
                {selectedIds.size === campaigns.length ? 'Deselect all' : 'Select all'}
              </button>
              {campaigns.map((c) => (
                <label key={c.id} className="dedup-select__item">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(c.id)}
                    onChange={() => toggleCampaign(c.id)}
                  />
                  <span>{c.name}</span>
                  <span className="muted">({c.terms.length})</span>
                </label>
              ))}
            </div>
            <div className="dedup-select__min">
              <label>
                Show terms {isWithinFileMode ? 'matched by at least' : 'in at least'}{' '}
                <input
                  type="number"
                  min={2}
                  max={20}
                  value={minCampaigns}
                  onChange={(e) => setMinCampaigns(Math.max(2, parseInt(e.target.value, 10) || 2))}
                />{' '}
                {isWithinFileMode ? 'keywords' : dedupMode === 'batches' ? 'batches' : 'campaigns'}
              </label>
            </div>
          </div>

          <div className="dedup-actions">
            {showLargeWarning && (
              <p className="warning">
                Large dataset ({totalTerms.toLocaleString()} terms). Processing may take a moment.
              </p>
            )}
          </div>

          {needsReimportForWithinFile && (
            <p className="warning dedup-batch-hint">
              Re-import this CSV in Campaign Input to enable keyword-level duplicate detection within a single file.
            </p>
          )}

          {dedupMode === 'batches' && !isWithinFileMode && dedupSources.length >= 2 && dedupBatchCount < 2 && (
            <p className="muted dedup-batch-hint">
              Batch mode needs selections from at least two batches (different bundle names, or mix bundled and unbundled files as separate batches).
            </p>
          )}

          {duplicates.length > 0 && (
            <>
              <p className="dedup-summary">
                <strong>{duplicates.length}</strong> terms{' '}
                {isWithinFileMode
                  ? `matched by ${minCampaigns}+ keywords in this file`
                  : `appear in ${minCampaigns}+ ${dedupMode === 'batches' ? 'batches' : 'campaigns'}`}
                .
              </p>
              <ExportControls
                items={duplicateTerms}
                format={exportFormat}
                onFormatChange={setExportFormat}
                onCopy={showCopyFeedback}
                onExportCSV={() => {}}
                label="Export duplicates"
              />
              {copyFeedback && <span className="feedback">Copied to clipboard.</span>}
              <DupResultsTable
                results={duplicates}
                batchMode={dedupMode === 'batches'}
                withinFileMode={isWithinFileMode}
              />
            </>
          )}

          {dedupSources.length >= (isWithinFileMode ? 1 : 2) &&
            duplicates.length === 0 &&
            !needsReimportForWithinFile &&
            !(dedupMode === 'batches' && !isWithinFileMode && dedupBatchCount < 2) && (
              <p className="muted">No duplicates found for the selected sources and minimum count.</p>
            )}
        </>
      )}

      <hr className="section-divider" />
      <h3>Single-sheet cross-campaign drain finder</h3>
      <p className="panel-desc">
        Upload one Sponsored Products/Brands bulk report that already contains many campaigns in a single sheet. This
        feature finds keywords that repeat across multiple campaign names and lets you filter by campaign count,
        combined clicks, and either impressions or sales. It is separate from the cross-campaign dedup flow above.
      </p>
      <div className="dedup-single-sheet">
        <div className="dedup-single-sheet__controls">
          <div className="dedup-single-sheet__field dedup-single-sheet__field--file">
            <label htmlFor="dedup-single-sheet-input" className="dedup-single-sheet__label">Upload single report</label>
            <input
              id="dedup-single-sheet-input"
              type="file"
              accept={TABULAR_UPLOAD_ACCEPT}
              onChange={handleSingleSheetChange}
              className="dedup-single-sheet__input dedup-single-sheet__input--file"
            />
          </div>
          <label className="dedup-single-sheet__field">
            <span className="dedup-single-sheet__label">Min campaigns</span>
            <input
              type="number"
              min={2}
              max={20}
              value={singleSheetMinCampaigns}
              onChange={(e) => setSingleSheetMinCampaigns(Math.max(2, parseInt(e.target.value, 10) || 2))}
              className="dedup-single-sheet__input"
            />
          </label>
          <div className="dedup-single-sheet__field">
            <span className="dedup-single-sheet__label">Combined clicks</span>
            <div className="dedup-single-sheet__pair">
              <select
                value={singleSheetClicksMode}
                onChange={(e) => setSingleSheetClicksMode(e.target.value as ComparatorMode)}
                className="dedup-single-sheet__input"
              >
                <option value="eq">Equal to</option>
                <option value="min">Min</option>
                <option value="max">Max</option>
              </select>
              <input
                type="number"
                min={0}
                max={1000000000}
                value={singleSheetMinClicks}
                onChange={(e) => setSingleSheetMinClicks(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="dedup-single-sheet__input"
              />
            </div>
          </div>
          <div className="dedup-single-sheet__field">
            <span className="dedup-single-sheet__label">Impressions</span>
            <div className="dedup-single-sheet__pair">
              <select
                value={singleSheetImprMode}
                onChange={(e) => setSingleSheetImprMode(e.target.value as ComparatorMode)}
                className="dedup-single-sheet__input"
              >
                <option value="eq">Equal to</option>
                <option value="min">Min</option>
                <option value="max">Max</option>
              </select>
              <input
                type="number"
                min={0}
                step="any"
                value={singleSheetMinImpressions}
                onChange={(e) => setSingleSheetMinImpressions(e.target.value)}
                className="dedup-single-sheet__input"
              />
            </div>
          </div>
          <div className="dedup-single-sheet__field">
            <span className="dedup-single-sheet__label">Orders</span>
            <div className="dedup-single-sheet__pair">
              <select
                value={singleSheetSalesMode}
                onChange={(e) => setSingleSheetSalesMode(e.target.value as ComparatorMode)}
                className="dedup-single-sheet__input"
              >
                <option value="eq">Equal to</option>
                <option value="min">Min</option>
                <option value="max">Max</option>
              </select>
              <input
                type="number"
                min={0}
                step="any"
                value={singleSheetMinOrders}
                onChange={(e) => setSingleSheetMinOrders(e.target.value)}
                className="dedup-single-sheet__input"
              />
            </div>
            <div className="dedup-single-sheet__pair">
              <input
                type="number"
                min={0}
                step="any"
                placeholder="Range min"
                value={singleSheetOrdersRangeMin}
                onChange={(e) => setSingleSheetOrdersRangeMin(e.target.value)}
                className="dedup-single-sheet__input"
              />
              <input
                type="number"
                min={0}
                step="any"
                placeholder="Range max"
                value={singleSheetOrdersRangeMax}
                onChange={(e) => setSingleSheetOrdersRangeMax(e.target.value)}
                className="dedup-single-sheet__input"
              />
            </div>
          </div>
        </div>
        {singleSheetLoading && <p className="muted">Loading and analyzing file…</p>}
        {singleSheetFileName && !singleSheetLoading && (
          <p className="muted">
            <strong>{singleSheetFileName}</strong> · {singleSheetResults.length} keyword
            {singleSheetResults.length === 1 ? '' : 's'} matched
          </p>
        )}
        {singleSheetError && <p className="warning">{singleSheetError}</p>}
        {!singleSheetLoading && singleSheetFileName && singleSheetResults.length === 0 && !singleSheetError && (
          <p className="muted">
            No matching duplicates found. Confirm your file has search term, campaign name, clicks, and sales/order
            columns.
          </p>
        )}
        {singleSheetResults.length > 0 && <SingleSheetDrainTable results={singleSheetResults} />}
      </div>
    </section>
  )
}

/** Purchase / order counts (summed per keyword). */
function formatPurchaseCount(n: number): string {
  const x = Number.isFinite(n) ? n : 0
  if (Math.abs(x - Math.round(x)) < 1e-9) return Math.round(x).toLocaleString()
  return x.toLocaleString(undefined, { maximumFractionDigits: 4 })
}

function formatAcosPct(n: number): string {
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`
}

type DupSortKey = 'term' | 'campaigns' | 'count' | 'totalClicks' | 'totalPurchases'
type DupSortDir = 'asc' | 'desc'

/** First click: text columns A→Z, numeric columns high→low (typical analytics). Toggle flips. */
const DEFAULT_DIR: Record<DupSortKey, DupSortDir> = {
  term: 'asc',
  campaigns: 'asc',
  count: 'desc',
  totalClicks: 'desc',
  totalPurchases: 'desc',
}

function parseOptionalNonNegNumber(s: string): number | undefined {
  const t = s.trim().replace(/,/g, '')
  if (!t) return undefined
  const n = parseFloat(t)
  if (!Number.isFinite(n) || n < 0) return undefined
  return n
}

function passesMetricThresholds(
  r: DuplicateResult,
  minClicks?: number,
  minPurch?: number,
  minAcosPct?: number,
  maxAcosPct?: number
): boolean {
  if (minClicks !== undefined && r.totalClicks < minClicks) return false
  if (minPurch !== undefined && r.totalPurchases < minPurch) return false
  if (minAcosPct !== undefined || maxAcosPct !== undefined) {
    const acos = r.totalAcosPct
    if (acos == null) return false
    if (minAcosPct !== undefined && acos < minAcosPct) return false
    if (maxAcosPct !== undefined && acos > maxAcosPct) return false
  }
  return true
}

function compareDupRows(a: DuplicateResult, b: DuplicateResult, key: DupSortKey): number {
  let cmp = 0
  switch (key) {
    case 'term':
      cmp = a.normalizedTerm.localeCompare(b.normalizedTerm, undefined, { sensitivity: 'base' })
      break
    case 'campaigns':
      cmp = a.campaigns.join('\u0001').localeCompare(b.campaigns.join('\u0001'), undefined, { sensitivity: 'base' })
      break
    case 'count':
      cmp = a.campaignCount - b.campaignCount
      break
    case 'totalClicks':
      cmp = a.totalClicks - b.totalClicks
      break
    case 'totalPurchases':
      cmp = a.totalPurchases - b.totalPurchases
      break
    default:
      cmp = 0
  }
  if (cmp === 0) cmp = a.normalizedTerm.localeCompare(b.normalizedTerm, undefined, { sensitivity: 'base' })
  return cmp
}

function DupResultsTable({
  results,
  batchMode = false,
  withinFileMode = false,
}: {
  results: DuplicateResult[]
  batchMode?: boolean
  withinFileMode?: boolean
}) {
  const [filterQuery, setFilterQuery] = useState('')
  const [minClicksInput, setMinClicksInput] = useState('')
  const [minPurchInput, setMinPurchInput] = useState('')
  const [minAcosInput, setMinAcosInput] = useState('')
  const [maxAcosInput, setMaxAcosInput] = useState('')
  const [sort, setSort] = useState<{ key: DupSortKey; dir: DupSortDir }>({
    key: 'count',
    dir: 'desc',
  })

  const metricParsed = useMemo(
    () => ({
      minClicks: parseOptionalNonNegNumber(minClicksInput),
      minPurch: parseOptionalNonNegNumber(minPurchInput),
      minAcos: parseOptionalNonNegNumber(minAcosInput),
      maxAcos: parseOptionalNonNegNumber(maxAcosInput),
    }),
    [minClicksInput, minPurchInput, minAcosInput, maxAcosInput]
  )

  const afterMetricFilters = useMemo(() => {
    const { minClicks, minPurch, minAcos, maxAcos } = metricParsed
    if (
      minClicks === undefined &&
      minPurch === undefined &&
      minAcos === undefined &&
      maxAcos === undefined
    ) {
      return results
    }
    return results.filter((r) => passesMetricThresholds(r, minClicks, minPurch, minAcos, maxAcos))
  }, [results, metricParsed])

  const filteredResults = useMemo(() => {
    const q = filterQuery.trim().toLowerCase()
    if (!q) return afterMetricFilters
    return afterMetricFilters.filter((r) => {
      if (r.normalizedTerm.toLowerCase().includes(q)) return true
      return r.campaigns.some((c) => c.toLowerCase().includes(q))
    })
  }, [afterMetricFilters, filterQuery])

  const handleSort = useCallback((key: DupSortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: DEFAULT_DIR[key] }
    )
  }, [])

  const sorted = useMemo(() => {
    const arr = [...filteredResults]
    const mul = sort.dir === 'asc' ? 1 : -1
    arr.sort((a, b) => mul * compareDupRows(a, b, sort.key))
    return arr
  }, [filteredResults, sort.key, sort.dir])

  const SortTh = ({
    colKey,
    children,
    align,
  }: {
    colKey: DupSortKey
    children: ReactNode
    align?: 'right'
  }) => {
    const active = sort.key === colKey
    const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'
    const activate = () => handleSort(colKey)
    return (
      <th
        scope="col"
        tabIndex={0}
        className="auto-exact-th-sortable dedup-th-sort"
        aria-sort={ariaSort}
        onClick={() => activate()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            activate()
          }
        }}
      >
        <span
          className={['auto-exact-th-inner', align === 'right' ? 'dedup-th-inner--right' : ''].filter(Boolean).join(' ')}
        >
          {children}
          {active && (sort.dir === 'asc' ? <ChevronUp className="auto-exact-sort-icon" aria-hidden /> : <ChevronDown className="auto-exact-sort-icon" aria-hidden />)}
        </span>
      </th>
    )
  }

  const textFilterActive = filterQuery.trim().length > 0
  const metricFilterActive =
    minClicksInput.trim() !== '' ||
    minPurchInput.trim() !== '' ||
    minAcosInput.trim() !== '' ||
    maxAcosInput.trim() !== ''
  const filterActive = textFilterActive || metricFilterActive

  return (
    <>
      <div className="dedup-metric-filters" aria-label="Filter by combined totals">
        <div className="dedup-metric-filters__intro">
          Combined totals (applies to each keyword row — same logic in As is and batch mode)
        </div>
        <div className="dedup-metric-filters__grid">
          <label className="dedup-metric-filters__field">
            <span className="dedup-metric-filters__field-label">Min clicks</span>
            <input
              type="text"
              inputMode="numeric"
              className="dedup-metric-filters__input"
              placeholder="—"
              value={minClicksInput}
              onChange={(e) => setMinClicksInput(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="dedup-metric-filters__field">
            <span className="dedup-metric-filters__field-label">Min orders</span>
            <input
              type="text"
              inputMode="numeric"
              className="dedup-metric-filters__input"
              placeholder="—"
              value={minPurchInput}
              onChange={(e) => setMinPurchInput(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="dedup-metric-filters__field">
            <span className="dedup-metric-filters__field-label">Min ACOS %</span>
            <input
              type="text"
              inputMode="decimal"
              className="dedup-metric-filters__input"
              placeholder="—"
              value={minAcosInput}
              onChange={(e) => setMinAcosInput(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="dedup-metric-filters__field">
            <span className="dedup-metric-filters__field-label">Max ACOS %</span>
            <input
              type="text"
              inputMode="decimal"
              className="dedup-metric-filters__input"
              placeholder="—"
              value={maxAcosInput}
              onChange={(e) => setMaxAcosInput(e.target.value)}
              autoComplete="off"
            />
          </label>
        </div>
        <p className="dedup-metric-filters__hint">
          Uses the combined row totals (all sources / all batches). ACOS filters apply only when blended ACOS exists. Leave fields blank to skip.
        </p>
      </div>
      <div className="dedup-table-filter" role="search">
        <label htmlFor="dedup-table-filter-input" className="dedup-table-filter__label">
          Filter table
        </label>
        <input
          id="dedup-table-filter-input"
          type="search"
          className="dedup-table-filter__input"
          placeholder={
            withinFileMode
              ? 'Search by term or matched keyword…'
              : batchMode
                ? 'Search by term or batch name…'
                : 'Search by term or source name…'
          }
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          autoComplete="off"
        />
        {filterActive && (
          <span className="dedup-table-filter__meta" aria-live="polite">
            {filteredResults.length} of {results.length} terms
          </span>
        )}
      </div>
      <div className="table-wrap table-wrap--sticky-header">
      <table className="results-table results-table--dedup-sort">
        <caption className="sr-only">
          Duplicate search terms across{' '}
          {withinFileMode ? 'matched keywords in one file' : batchMode ? 'batches' : 'campaigns'}. Click a column
          heading to sort. Click again to reverse order.
        </caption>
        <thead>
          <tr>
            <SortTh colKey="term">Normalized term</SortTh>
            <SortTh colKey="count" align="right">
              Count
            </SortTh>
            <SortTh colKey="campaigns">
              {withinFileMode ? 'Matched keyword' : batchMode ? 'Batch' : 'Source (file / campaign)'}
            </SortTh>
            <SortTh colKey="totalClicks" align="right">
              Clicks
            </SortTh>
            <SortTh colKey="totalPurchases" align="right">
              Purch.
            </SortTh>
            <th scope="col" className="dedup-th-static">
              ACOS
            </th>
          </tr>
        </thead>
        {sorted.map((r) => {
          const n = r.campaigns.length
          const span = n + 1
          return (
            <tbody key={r.normalizedTerm} className="dedup-tbody-group">
              {r.campaigns.map((camp, i) => {
                const purch = r.purchasesByCampaign.get(camp) ?? 0
                const acos = r.acosPctByCampaign.get(camp)
                return (
                  <tr key={camp}>
                    {i === 0 && (
                      <>
                        <td rowSpan={span} className="dedup-td-term">
                          <code>{r.normalizedTerm}</code>
                        </td>
                        <td rowSpan={span} className="dedup-td-num dedup-td-count">
                          {r.campaignCount}
                        </td>
                      </>
                    )}
                    <td className="dedup-td-source">{camp}</td>
                    <td className="dedup-td-num dedup-td-metric">{(r.clicksByCampaign.get(camp) ?? 0).toLocaleString()}</td>
                    <td className="dedup-td-num dedup-td-metric">
                      {purch > 0 ? formatPurchaseCount(purch) : '—'}
                    </td>
                    <td className="dedup-td-num dedup-td-metric dedup-td-acos">
                      {purch > 0 ? (acos != null ? formatAcosPct(acos) : '—') : '—'}
                    </td>
                  </tr>
                )
              })}
              <tr className="dedup-row-combined">
                <td className="dedup-td-source dedup-td-combined-label">
                  {withinFileMode
                    ? 'All keywords combined'
                    : batchMode
                      ? 'All batches combined'
                      : 'All sources combined'}
                </td>
                <td className="dedup-td-num dedup-td-metric dedup-td-combined">{r.totalClicks.toLocaleString()}</td>
                <td className="dedup-td-num dedup-td-metric dedup-td-combined">
                  {r.totalPurchases > 0 ? formatPurchaseCount(r.totalPurchases) : '—'}
                </td>
                <td className="dedup-td-num dedup-td-metric dedup-td-combined dedup-td-acos">
                  {r.totalAcosPct != null ? formatAcosPct(r.totalAcosPct) : '—'}
                </td>
              </tr>
            </tbody>
          )
        })}
      </table>
    </div>
    </>
  )
}

function SingleSheetDrainTable({ results }: { results: SingleSheetDuplicateResult[] }) {
  return (
    <div className="table-wrap table-wrap--sticky-header">
      <table className="results-table results-table--dedup-sort results-table--single-sheet">
        <thead>
          <tr>
            <th scope="col">Keyword</th>
            <th scope="col" className="dedup-th-static">Campaign count</th>
            <th scope="col">Campaign name</th>
            <th scope="col" className="dedup-th-static">Clicks in campaign</th>
            <th scope="col" className="dedup-th-static">Orders in campaign</th>
            <th scope="col" className="dedup-th-static">Combined clicks</th>
          </tr>
        </thead>
        {results.map((r) => {
          const n = r.campaigns.length
          return (
            <tbody key={r.normalizedTerm} className="dedup-tbody-group">
              {r.campaigns.map((camp, i) => (
                <tr key={`${r.normalizedTerm}-${camp}`}>
                  {i === 0 && (
                    <>
                      <td rowSpan={n} className="dedup-td-term">
                        <code>{r.normalizedTerm}</code>
                      </td>
                      <td rowSpan={n} className="dedup-td-num dedup-td-count">{r.campaignCount}</td>
                    </>
                  )}
                  <td className="dedup-td-source">{camp}</td>
                  <td className="dedup-td-num dedup-td-metric">
                    {(r.clicksByCampaign.get(camp) ?? 0).toLocaleString()}
                  </td>
                  <td className="dedup-td-num dedup-td-metric">
                    {(r.purchasesByCampaign.get(camp) ?? 0).toLocaleString(undefined, {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 4,
                    })}
                  </td>
                  {i === 0 && (
                    <td rowSpan={n} className="dedup-td-num dedup-td-combined">
                      {r.totalClicks.toLocaleString()}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          )
        })}
      </table>
    </div>
  )
}
