import { useState, useCallback, useMemo, useEffect, useRef, type ReactNode } from 'react'
import { ChevronUp, ChevronDown, Info } from 'lucide-react'
import type { Campaign, DuplicateResult } from '../types'
import {
  buildCampaignFromSearchTermRows,
  buildCampaignFromTerms,
  campaignsHaveMatchBreakdown,
  findCrossBatchDuplicates,
  findCrossCampaignDuplicates,
  findSingleSheetDuplicatesByCampaign,
  findWithinFileDuplicates,
  normalizeExactTerm,
  withinFileMatchLabels,
  type SingleSheetDuplicateResult,
} from '../utils/deduplication'
import { LARGE_DATA_WARNING } from '../types'
import { detectSearchTermColumn, findSearchTermReportHeaderRow } from '../utils/csv'
import { resolveCampaignSourceRows } from '../autoExact/utils/campaignSourceRows'
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
  const [nonDuplicatesOnly, setNonDuplicatesOnly] = useState(false)
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

  useEffect(() => {
    setSelectedIds((prev) => {
      const validIds = new Set(campaigns.map((c) => c.id))
      const next = new Set([...prev].filter((id) => validIds.has(id)))
      if (campaigns.length === 1) {
        next.add(campaigns[0]!.id)
      }
      return next
    })
  }, [campaigns])

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

  // Rebuild each campaign's dedup keys with punctuation-preserving normalization so distinct
  // customer search terms (e.g. "gh kh test kit" vs "gh & kh test kit") are NOT merged. Uses the
  // original uploaded rows; falls back to the shared-normalized campaign when rows are unavailable.
  const exactCampaignById = useMemo(() => {
    const map = new Map<string, Campaign>()
    for (const c of campaigns) {
      const rows = resolveCampaignSourceRows(c)
      if (!rows || rows.length < 2) {
        map.set(c.id, c)
        continue
      }
      const headerRow = findSearchTermReportHeaderRow(rows)
      const termCol = detectSearchTermColumn(rows[headerRow] ?? rows[0] ?? [])
      if (termCol < 0) {
        map.set(c.id, c)
        continue
      }
      const built = buildCampaignFromSearchTermRows(rows, termCol, normalizeExactTerm)
      map.set(c.id, { ...c, ...built })
    }
    return map
  }, [campaigns])

  const selectedCampaigns = useMemo(
    () => campaigns.filter((c) => selectedIds.has(c.id)),
    [campaigns, selectedIds]
  )

  // Exact-normalized versions of the selected campaigns, used for all dedup computation.
  const selectedExactCampaigns = useMemo(
    () => selectedCampaigns.map((c) => exactCampaignById.get(c.id) ?? c),
    [selectedCampaigns, exactCampaignById]
  )

  const manualKeywordCampaign = useMemo((): Campaign | null => {
    const lines = manualKeywordText
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (lines.length === 0) return null
    const fromTerms = buildCampaignFromTerms(lines, normalizeExactTerm)
    return {
      id: CUSTOM_MANUAL_KEYWORDS_ID,
      name: CUSTOM_MANUAL_KEYWORDS_LABEL,
      bundleName: CUSTOM_MANUAL_KEYWORDS_LABEL,
      ...fromTerms,
    }
  }, [manualKeywordText])

  const dedupSources = useMemo(() => {
    const list = [...selectedExactCampaigns]
    if (manualKeywordCampaign) list.push(manualKeywordCampaign)
    return list
  }, [selectedExactCampaigns, manualKeywordCampaign])

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
    if (manualKeywordCampaign || selectedCampaigns.length === 0) return false
    return true
  }, [selectedCampaigns.length, manualKeywordCampaign])

  const withinFileSources = selectedExactCampaigns

  const duplicates = useMemo(() => {
    if (isWithinFileMode) {
      if (nonDuplicatesOnly) {
        return findWithinFileDuplicates(withinFileSources, 1, 1)
      }
      return findWithinFileDuplicates(withinFileSources, minCampaigns)
    }
    if (dedupSources.length === 0) return []
    if (dedupSources.length < 2) return []
    if (dedupMode === 'batches') {
      if (dedupBatchCount < 2) return []
      return findCrossBatchDuplicates(dedupSources, minCampaigns)
    }
    return findCrossCampaignDuplicates(dedupSources, minCampaigns)
  }, [
    dedupSources,
    minCampaigns,
    dedupMode,
    dedupBatchCount,
    isWithinFileMode,
    withinFileSources,
    nonDuplicatesOnly,
  ])

  const needsReimportForWithinFile =
    isWithinFileMode && withinFileSources.length > 0 && !campaignsHaveMatchBreakdown(withinFileSources)

  const withinFileLabels = useMemo(
    () => withinFileMatchLabels(withinFileSources[0]?.matchTargetKind),
    [withinFileSources]
  )

  const duplicateTerms = useMemo(() => duplicates.map((d) => d.normalizedTerm), [duplicates])
  const [exportTerms, setExportTerms] = useState<string[]>([])

  useEffect(() => {
    setExportTerms(duplicateTerms)
  }, [duplicateTerms])

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
      0,
      normalizeExactTerm
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
      <div className="dedup-panel-heading">
        <h2>Cross-campaign deduplication</h2>
        <span className="dedup-info-tip" tabIndex={0} aria-label="About cross-campaign deduplication">
          <Info className="dedup-info-tip__icon" aria-hidden size={18} strokeWidth={2.25} />
          <span className="dedup-info-tip__content" role="tooltip">
            Select 1 or more campaigns to find search terms that repeat. The app finds the same customer search term matched by multiple <strong>Keywords</strong> rows (combined across all selected uploads). Search terms are matched exactly (case- and spacing-insensitive) — punctuation like <code>&</code> is kept, so <code>gh kh test kit</code> and <code>gh &amp; kh test kit</code> stay separate. Use <strong>As is</strong> or <strong>Batch mode</strong> to organize uploads from Campaign Input. Each duplicate term uses one block of rows, then a combined totals row with blended <strong>ACOS</strong> when your CSVs include spend and attributed sales. Excel exports often use UTF-16 or semicolon separators — both are supported. Re-import files after app updates so metrics refresh.
          </span>
        </span>
      </div>

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
            <details className="dedup-manual-keywords">
              <summary className="dedup-manual-keywords__label">
                {CUSTOM_MANUAL_KEYWORDS_LABEL}
              </summary>
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
            </details>
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
              <label className={nonDuplicatesOnly && isWithinFileMode ? 'dedup-select__min--disabled' : undefined}>
                Show terms {isWithinFileMode ? 'matched by at least' : 'in at least'}{' '}
                <input
                  type="number"
                  min={2}
                  max={20}
                  value={minCampaigns}
                  disabled={nonDuplicatesOnly && isWithinFileMode}
                  onChange={(e) => setMinCampaigns(Math.max(2, parseInt(e.target.value, 10) || 2))}
                />{' '}
                {isWithinFileMode ? withinFileLabels.plural : dedupMode === 'batches' ? 'batches' : 'campaigns'}
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

          {campaigns.length > 0 && selectedIds.size === 0 && (
            <p className="muted dedup-batch-hint">
              Select one or more campaigns above to run duplicate detection.
            </p>
          )}

          {needsReimportForWithinFile && (
            <p className="warning dedup-batch-hint">
              Re-import this CSV in Campaign Input to enable keyword-level duplicate detection within a single file.
            </p>
          )}

          {dedupMode === 'batches' && manualKeywordCampaign && !isWithinFileMode && dedupSources.length >= 2 && dedupBatchCount < 2 && (
            <p className="muted dedup-batch-hint">
              Batch mode needs selections from at least two batches (different bundle names, or mix bundled and unbundled files as separate batches).
            </p>
          )}

          {duplicates.length > 0 && (
            <>
              <p className="dedup-summary">
                <strong>{duplicates.length}</strong> terms{' '}
                {nonDuplicatesOnly && isWithinFileMode
                  ? `matched by exactly 1 ${withinFileLabels.singular} (not in the duplicate pool)${selectedCampaigns.length === 1 ? '' : ' across selected uploads'}`
                  : isWithinFileMode
                    ? `matched by ${minCampaigns}+ ${withinFileLabels.plural}${selectedCampaigns.length === 1 ? ' in this file' : ' across selected uploads'}`
                    : `appear in ${minCampaigns}+ ${dedupMode === 'batches' ? 'batches' : 'campaigns'}`}
                .
              </p>
              <details className="dedup-export-collapsible">
                <summary className="dedup-export-collapsible__summary">
                  {nonDuplicatesOnly && isWithinFileMode ? 'Export terms' : 'Export duplicates'}
                </summary>
                <ExportControls
                  items={exportTerms}
                  format={exportFormat}
                  onFormatChange={setExportFormat}
                  onCopy={showCopyFeedback}
                  onExportCSV={() => {}}
                  label=""
                />
                {copyFeedback && <span className="feedback dedup-export-collapsible__feedback">Copied to clipboard.</span>}
              </details>
              {exportTerms.length !== duplicateTerms.length && (
                <p className="muted dedup-export-hint">
                  Copy and CSV export use the {exportTerms.length} term{exportTerms.length === 1 ? '' : 's'} currently
                  visible in the table below ({duplicateTerms.length} total).
                </p>
              )}
              <DupResultsTable
                results={duplicates}
                batchMode={dedupMode === 'batches'}
                withinFileMode={isWithinFileMode}
                nonDuplicatesOnly={nonDuplicatesOnly}
                onNonDuplicatesOnlyChange={setNonDuplicatesOnly}
                withinFileLabels={withinFileLabels}
                onVisibleTermsChange={setExportTerms}
              />
            </>
          )}

          {selectedIds.size > 0 &&
            duplicates.length === 0 &&
            !needsReimportForWithinFile &&
            !(dedupMode === 'batches' && !isWithinFileMode && dedupBatchCount < 2) &&
            dedupSources.length >= (isWithinFileMode ? 1 : 2) && (
              <p className="muted">
                {nonDuplicatesOnly && isWithinFileMode
                  ? 'No non-duplicate terms found (every search term is matched by 2+ broad targets).'
                  : 'No duplicates found for the selected sources and minimum count.'}
              </p>
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

function dupTotalAttributedSales(r: DuplicateResult): number {
  let sum = 0
  for (const v of r.attributedSalesByCampaign.values()) sum += v
  return sum
}

/** Zero sales = no attributed revenue and no purchase/order count on combined totals. */
function passesZeroSalesOnly(r: DuplicateResult): boolean {
  return dupTotalAttributedSales(r) === 0 && r.totalPurchases === 0
}

function passesMetricThresholds(
  r: DuplicateResult,
  minClicks?: number,
  maxClicks?: number,
  minPurch?: number,
  maxPurch?: number,
  minAcosPct?: number,
  maxAcosPct?: number
): boolean {
  if (minClicks !== undefined && r.totalClicks < minClicks) return false
  if (maxClicks !== undefined && r.totalClicks > maxClicks) return false
  if (minPurch !== undefined && r.totalPurchases < minPurch) return false
  if (maxPurch !== undefined && r.totalPurchases > maxPurch) return false
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

interface MetricFilterValues {
  minClicks: string
  maxClicks: string
  minPurch: string
  maxPurch: string
  minAcos: string
  maxAcos: string
  zeroSalesOnly: boolean
}

const METRIC_PRESETS_STORAGE_KEY = 'dedup-metric-filter-presets-by-mode'
const LEGACY_METRIC_PRESETS_STORAGE_KEY = 'dedup-metric-filter-presets'

const DEFAULT_METRIC_PRESETS: [MetricFilterValues, MetricFilterValues] = [
  {
    minClicks: '',
    maxClicks: '',
    minPurch: '',
    maxPurch: '3',
    minAcos: '65',
    maxAcos: '',
    zeroSalesOnly: false,
  },
  {
    minClicks: '15',
    maxClicks: '',
    minPurch: '',
    maxPurch: '',
    minAcos: '',
    maxAcos: '',
    zeroSalesOnly: true,
  },
]

const EMPTY_METRIC_FILTER_VALUES: MetricFilterValues = {
  minClicks: '',
  maxClicks: '',
  minPurch: '',
  maxPurch: '',
  minAcos: '',
  maxAcos: '',
  zeroSalesOnly: false,
}

type MetricPresetModeKey = 'duplicates' | 'nonDuplicates'

interface MetricPresetModeState {
  presets: [MetricFilterValues, MetricFilterValues]
  activePreset: 0 | 1 | null
}

interface StoredMetricPresetsByMode {
  duplicates: MetricPresetModeState
  nonDuplicates: MetricPresetModeState
}

function cloneDefaultPresets(): [MetricFilterValues, MetricFilterValues] {
  return [{ ...DEFAULT_METRIC_PRESETS[0] }, { ...DEFAULT_METRIC_PRESETS[1] }]
}

function defaultMetricPresetModeState(): MetricPresetModeState {
  return {
    presets: cloneDefaultPresets(),
    activePreset: null,
  }
}

function isMetricPresetModeState(v: unknown): v is MetricPresetModeState {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  const presets = o.presets
  return (
    Array.isArray(presets) &&
    presets.length === 2 &&
    isMetricFilterValues(presets[0]) &&
    isMetricFilterValues(presets[1]) &&
    (o.activePreset === null || o.activePreset === 0 || o.activePreset === 1)
  )
}

function isStoredMetricPresetsByMode(v: unknown): v is StoredMetricPresetsByMode {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return isMetricPresetModeState(o.duplicates) && isMetricPresetModeState(o.nonDuplicates)
}

function loadMetricPresetsByMode(): StoredMetricPresetsByMode {
  const defaults: StoredMetricPresetsByMode = {
    duplicates: defaultMetricPresetModeState(),
    nonDuplicates: defaultMetricPresetModeState(),
  }
  try {
    const rawV2 = localStorage.getItem(METRIC_PRESETS_STORAGE_KEY)
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as unknown
      if (isStoredMetricPresetsByMode(parsed)) return parsed
    }
    const rawV1 = localStorage.getItem(LEGACY_METRIC_PRESETS_STORAGE_KEY)
    if (rawV1) {
      const parsed = JSON.parse(rawV1) as unknown
      if (
        Array.isArray(parsed) &&
        parsed.length === 2 &&
        isMetricFilterValues(parsed[0]) &&
        isMetricFilterValues(parsed[1])
      ) {
        return {
          duplicates: { presets: [parsed[0], parsed[1]], activePreset: null },
          nonDuplicates: defaultMetricPresetModeState(),
        }
      }
    }
  } catch {
    // ignore
  }
  return defaults
}

function isMetricFilterValues(v: unknown): v is MetricFilterValues {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    typeof o.minClicks === 'string' &&
    typeof o.maxClicks === 'string' &&
    typeof o.minPurch === 'string' &&
    typeof o.maxPurch === 'string' &&
    typeof o.minAcos === 'string' &&
    typeof o.maxAcos === 'string' &&
    typeof o.zeroSalesOnly === 'boolean'
  )
}

function applyMetricFilterValues(values: MetricFilterValues, apply: {
  setMinClicksInput: (v: string) => void
  setMaxClicksInput: (v: string) => void
  setMinPurchInput: (v: string) => void
  setMaxPurchInput: (v: string) => void
  setMinAcosInput: (v: string) => void
  setMaxAcosInput: (v: string) => void
  setZeroSalesOnly: (v: boolean) => void
}) {
  apply.setMinClicksInput(values.minClicks)
  apply.setMaxClicksInput(values.maxClicks)
  apply.setMinPurchInput(values.minPurch)
  apply.setMaxPurchInput(values.maxPurch)
  apply.setMinAcosInput(values.minAcos)
  apply.setMaxAcosInput(values.maxAcos)
  apply.setZeroSalesOnly(values.zeroSalesOnly)
}

function CopyableNormalizedTerm({ term }: { term: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(term).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    })
  }, [term])

  return (
    <code
      className="dedup-term-copy"
      role="button"
      tabIndex={0}
      title={copied ? 'Copied!' : 'Click to copy'}
      onClick={handleCopy}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleCopy()
        }
      }}
    >
      {term}
    </code>
  )
}

function DupResultsTable({
  results,
  batchMode = false,
  withinFileMode = false,
  nonDuplicatesOnly = false,
  onNonDuplicatesOnlyChange,
  withinFileLabels = withinFileMatchLabels(undefined),
  onVisibleTermsChange,
}: {
  results: DuplicateResult[]
  batchMode?: boolean
  withinFileMode?: boolean
  nonDuplicatesOnly?: boolean
  onNonDuplicatesOnlyChange?: (value: boolean) => void
  withinFileLabels?: ReturnType<typeof withinFileMatchLabels>
  onVisibleTermsChange?: (terms: string[]) => void
}) {
  const presetModeKey: MetricPresetModeKey =
    withinFileMode && nonDuplicatesOnly ? 'nonDuplicates' : 'duplicates'
  const [presetModes, setPresetModes] = useState(loadMetricPresetsByMode)
  const initialMetricFilters = useMemo(() => {
    const modeState = loadMetricPresetsByMode()[presetModeKey]
    return modeState.activePreset !== null
      ? modeState.presets[modeState.activePreset]
      : EMPTY_METRIC_FILTER_VALUES
  }, [presetModeKey])
  const [filterQuery, setFilterQuery] = useState('')
  const [minClicksInput, setMinClicksInput] = useState(initialMetricFilters.minClicks)
  const [maxClicksInput, setMaxClicksInput] = useState(initialMetricFilters.maxClicks)
  const [minPurchInput, setMinPurchInput] = useState(initialMetricFilters.minPurch)
  const [maxPurchInput, setMaxPurchInput] = useState(initialMetricFilters.maxPurch)
  const [minAcosInput, setMinAcosInput] = useState(initialMetricFilters.minAcos)
  const [maxAcosInput, setMaxAcosInput] = useState(initialMetricFilters.maxAcos)
  const [zeroSalesOnly, setZeroSalesOnly] = useState(initialMetricFilters.zeroSalesOnly)
  const metricPresets = presetModes[presetModeKey].presets
  const activeMetricPreset = presetModes[presetModeKey].activePreset
  const [sort, setSort] = useState<{ key: DupSortKey; dir: DupSortDir }>({
    key: 'totalClicks',
    dir: 'desc',
  })
  const [selectedTerms, setSelectedTerms] = useState<Set<string>>(new Set())
  const [selectionCopyFeedback, setSelectionCopyFeedback] = useState(false)
  const selectAllCheckRef = useRef<HTMLInputElement>(null)
  const selectAllAfterPresetRef = useRef(false)
  const [presetSelectNonce, setPresetSelectNonce] = useState(0)
  const presetModesRef = useRef(presetModes)
  const prevPresetModeKeyRef = useRef<MetricPresetModeKey | null>(null)

  presetModesRef.current = presetModes

  useEffect(() => {
    setSelectedTerms(new Set())
  }, [results])

  useEffect(() => {
    localStorage.setItem(METRIC_PRESETS_STORAGE_KEY, JSON.stringify(presetModes))
  }, [presetModes])

  useEffect(() => {
    const prev = prevPresetModeKeyRef.current
    prevPresetModeKeyRef.current = presetModeKey
    if (prev !== null && prev === presetModeKey) return

    const modeState = presetModesRef.current[presetModeKey]
    const filterApply = {
      setMinClicksInput,
      setMaxClicksInput,
      setMinPurchInput,
      setMaxPurchInput,
      setMinAcosInput,
      setMaxAcosInput,
      setZeroSalesOnly,
    }
    if (modeState.activePreset !== null) {
      applyMetricFilterValues(modeState.presets[modeState.activePreset], filterApply)
      selectAllAfterPresetRef.current = true
      setPresetSelectNonce((n) => n + 1)
    } else {
      applyMetricFilterValues(EMPTY_METRIC_FILTER_VALUES, filterApply)
    }
  }, [presetModeKey])

  const patchActivePreset = useCallback(
    (patch: Partial<MetricFilterValues>) => {
      if (activeMetricPreset === null) return
      setPresetModes((prev) => {
        const mode = prev[presetModeKey]
        const nextPresets: [MetricFilterValues, MetricFilterValues] = [mode.presets[0], mode.presets[1]]
        nextPresets[activeMetricPreset] = { ...nextPresets[activeMetricPreset], ...patch }
        return {
          ...prev,
          [presetModeKey]: { ...mode, presets: nextPresets },
        }
      })
    },
    [activeMetricPreset, presetModeKey]
  )

  const metricParsed = useMemo(
    () => ({
      minClicks: parseOptionalNonNegNumber(minClicksInput),
      maxClicks: parseOptionalNonNegNumber(maxClicksInput),
      minPurch: parseOptionalNonNegNumber(minPurchInput),
      maxPurch: parseOptionalNonNegNumber(maxPurchInput),
      minAcos: parseOptionalNonNegNumber(minAcosInput),
      maxAcos: parseOptionalNonNegNumber(maxAcosInput),
    }),
    [minClicksInput, maxClicksInput, minPurchInput, maxPurchInput, minAcosInput, maxAcosInput]
  )

  const afterMetricFilters = useMemo(() => {
    const { minClicks, maxClicks, minPurch, maxPurch, minAcos, maxAcos } = metricParsed
    let list = results
    if (
      minClicks !== undefined ||
      maxClicks !== undefined ||
      minPurch !== undefined ||
      maxPurch !== undefined ||
      minAcos !== undefined ||
      maxAcos !== undefined
    ) {
      list = list.filter((r) =>
        passesMetricThresholds(r, minClicks, maxClicks, minPurch, maxPurch, minAcos, maxAcos)
      )
    }
    if (zeroSalesOnly) {
      list = list.filter((r) => passesZeroSalesOnly(r))
    }
    return list
  }, [results, metricParsed, zeroSalesOnly])

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

  useEffect(() => {
    onVisibleTermsChange?.(sorted.map((r) => r.normalizedTerm))
  }, [sorted, onVisibleTermsChange])

  const visibleSelectedCount = useMemo(
    () => sorted.filter((r) => selectedTerms.has(r.normalizedTerm)).length,
    [sorted, selectedTerms]
  )

  useEffect(() => {
    const el = selectAllCheckRef.current
    if (!el) return
    el.indeterminate = visibleSelectedCount > 0 && visibleSelectedCount < sorted.length
  }, [visibleSelectedCount, sorted.length])

  useEffect(() => {
    const visibleTerms = new Set(sorted.map((r) => r.normalizedTerm))
    setSelectedTerms((prev) => {
      if (prev.size === 0) return prev
      const next = new Set([...prev].filter((term) => visibleTerms.has(term)))
      return next.size === prev.size ? prev : next
    })
  }, [sorted])

  useEffect(() => {
    if (!selectAllAfterPresetRef.current) return
    selectAllAfterPresetRef.current = false
    setSelectedTerms(new Set(sorted.map((r) => r.normalizedTerm)))
  }, [sorted, presetSelectNonce])

  const toggleTermSelection = useCallback((term: string) => {
    setSelectedTerms((prev) => {
      const next = new Set(prev)
      if (next.has(term)) next.delete(term)
      else next.add(term)
      return next
    })
  }, [])

  const toggleAllVisible = useCallback(() => {
    setSelectedTerms((prev) => {
      const allVisibleSelected =
        sorted.length > 0 && sorted.every((r) => prev.has(r.normalizedTerm))
      if (allVisibleSelected) {
        const next = new Set(prev)
        for (const r of sorted) next.delete(r.normalizedTerm)
        return next
      }
      return new Set(sorted.map((r) => r.normalizedTerm))
    })
  }, [sorted])

  const copySelectedTerms = useCallback(() => {
    const selected = sorted.filter((r) => selectedTerms.has(r.normalizedTerm))
    const text = selected.map((r) => r.normalizedTerm).join('\n')
    void navigator.clipboard.writeText(text).then(() => {
      setSelectionCopyFeedback(true)
      window.setTimeout(() => setSelectionCopyFeedback(false), 2000)
    })
  }, [sorted, selectedTerms])

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

  const applyMetricPreset = useCallback(
    (index: 0 | 1) => {
      const values = metricPresets[index]
      applyMetricFilterValues(values, {
        setMinClicksInput,
        setMaxClicksInput,
        setMinPurchInput,
        setMaxPurchInput,
        setMinAcosInput,
        setMaxAcosInput,
        setZeroSalesOnly,
      })
      setPresetModes((prev) => ({
        ...prev,
        [presetModeKey]: { ...prev[presetModeKey], activePreset: index },
      }))
      selectAllAfterPresetRef.current = true
      setPresetSelectNonce((n) => n + 1)
    },
    [metricPresets, presetModeKey]
  )

  const textFilterActive = filterQuery.trim().length > 0
  const metricFilterActive =
    minClicksInput.trim() !== '' ||
    maxClicksInput.trim() !== '' ||
    minPurchInput.trim() !== '' ||
    maxPurchInput.trim() !== '' ||
    minAcosInput.trim() !== '' ||
    maxAcosInput.trim() !== '' ||
    zeroSalesOnly
  const filterActive = textFilterActive || metricFilterActive

  return (
    <>
      <div className="dedup-metric-filters" aria-label="Filter by combined totals">
        <div className="dedup-metric-filters__intro">
          Combined totals (applies to each keyword row — same logic in As is and batch mode)
        </div>
        <div className="dedup-metric-filters__presets">
          <button
            type="button"
            className={['btn', 'btn--small', activeMetricPreset === 0 ? 'btn--primary' : 'btn--secondary'].join(' ')}
            onClick={() => applyMetricPreset(0)}
          >
            Preset 1
          </button>
          <button
            type="button"
            className={['btn', 'btn--small', activeMetricPreset === 1 ? 'btn--primary' : 'btn--secondary'].join(' ')}
            onClick={() => applyMetricPreset(1)}
          >
            Preset 2
          </button>
          {withinFileMode && onNonDuplicatesOnlyChange && (
            <label
              className={[
                'btn',
                'dedup-metric-filters__non-dup',
                nonDuplicatesOnly ? 'btn--primary' : 'btn--secondary',
              ].join(' ')}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={nonDuplicatesOnly}
                onChange={(e) => onNonDuplicatesOnlyChange(e.target.checked)}
              />
              Non-duplicate terms only (one {withinFileLabels.singular} per search term)
            </label>
          )}
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
              onChange={(e) => {
                const v = e.target.value
                setMinClicksInput(v)
                patchActivePreset({ minClicks: v })
              }}
              autoComplete="off"
            />
          </label>
          <label className="dedup-metric-filters__field">
            <span className="dedup-metric-filters__field-label">Max clicks</span>
            <input
              type="text"
              inputMode="numeric"
              className="dedup-metric-filters__input"
              placeholder="—"
              value={maxClicksInput}
              onChange={(e) => {
                const v = e.target.value
                setMaxClicksInput(v)
                patchActivePreset({ maxClicks: v })
              }}
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
              onChange={(e) => {
                const v = e.target.value
                setMinPurchInput(v)
                patchActivePreset({ minPurch: v })
              }}
              autoComplete="off"
            />
          </label>
          <label className="dedup-metric-filters__field">
            <span className="dedup-metric-filters__field-label">Max orders</span>
            <input
              type="text"
              inputMode="numeric"
              className="dedup-metric-filters__input"
              placeholder="—"
              value={maxPurchInput}
              onChange={(e) => {
                const v = e.target.value
                setMaxPurchInput(v)
                patchActivePreset({ maxPurch: v })
              }}
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
              onChange={(e) => {
                const v = e.target.value
                setMinAcosInput(v)
                patchActivePreset({ minAcos: v })
              }}
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
              onChange={(e) => {
                const v = e.target.value
                setMaxAcosInput(v)
                patchActivePreset({ maxAcos: v })
              }}
              autoComplete="off"
            />
          </label>
          <label className="dedup-metric-filters__field dedup-metric-filters__field--checkbox">
            <span className="dedup-metric-filters__field-label">Sales filter</span>
            <span className="dedup-metric-filters__checkbox-row">
              <input
                type="checkbox"
                checked={zeroSalesOnly}
                onChange={(e) => {
                  const v = e.target.checked
                  setZeroSalesOnly(v)
                  patchActivePreset({ zeroSalesOnly: v })
                }}
              />
              Zero sales only
            </span>
          </label>
        </div>
        <p className="dedup-metric-filters__hint">
          Uses the combined row totals (all sources / all batches). ACOS uses spend÷sales when your CSV has those columns, otherwise the report's own ACOS column (orders-weighted for combined rows). Zero sales excludes terms with any purchases/orders or attributed sales revenue. Leave fields blank to skip.
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
              ? withinFileLabels.searchPlaceholder
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
      <div className="dedup-selection-actions">
        <button
          type="button"
          className="btn btn--primary btn--small"
          disabled={visibleSelectedCount === 0}
          onClick={copySelectedTerms}
        >
          Copy selected{visibleSelectedCount > 0 ? ` (${visibleSelectedCount})` : ''}
        </button>
        {selectionCopyFeedback && <span className="feedback">Copied selected terms to clipboard.</span>}
      </div>
      <div className="table-wrap table-wrap--sticky-header">
      <table className="results-table results-table--dedup-sort">
        <caption className="sr-only">
          Duplicate search terms across{' '}
          {withinFileMode ? `matched ${withinFileLabels.plural} in one file` : batchMode ? 'batches' : 'campaigns'}. Click a column
          heading to sort. Click again to reverse order.
        </caption>
        <thead>
          <tr>
            <th scope="col" className="dedup-th-select">
              <input
                ref={selectAllCheckRef}
                type="checkbox"
                checked={sorted.length > 0 && visibleSelectedCount === sorted.length}
                onChange={toggleAllVisible}
                aria-label="Select all visible terms"
              />
            </th>
            <SortTh colKey="term">Normalized term</SortTh>
            <SortTh colKey="count" align="right">
              Count
            </SortTh>
            <SortTh colKey="campaigns">
              {withinFileMode ? withinFileLabels.singular : batchMode ? 'Batch' : 'Source (file / campaign)'}
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
                        <td rowSpan={span} className="dedup-td-select">
                          <input
                            type="checkbox"
                            checked={selectedTerms.has(r.normalizedTerm)}
                            onChange={() => toggleTermSelection(r.normalizedTerm)}
                            aria-label={`Select ${r.normalizedTerm}`}
                          />
                        </td>
                        <td rowSpan={span} className="dedup-td-term">
                          <CopyableNormalizedTerm term={r.normalizedTerm} />
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
                      {acos != null ? formatAcosPct(acos) : '—'}
                    </td>
                  </tr>
                )
              })}
              <tr className="dedup-row-combined">
                <td className="dedup-td-source dedup-td-combined-label">
                  {withinFileMode
                    ? withinFileLabels.combined
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
