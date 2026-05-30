import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TopicProfile } from '../types'
import {
  aggregateByNormalizedTerm,
  oneRowPerCsvRow,
  type SearchTermAggregateScope,
} from './utils/aggregation'
import { getHeaderSuggestions } from './utils/csvHelpers'
import { getPromoteList, getReviewQueue, runScoring } from './utils/scoring'
import type { ColumnMapping, PromotionCriteria, ScoredTerm } from './types'
import { DEFAULT_COLUMN_MAPPING, DEFAULT_CRITERIA } from './types'
import { ColumnMapper, getMissingRequired } from './components/ColumnMapper'
import { CriteriaPanel } from './components/CriteriaPanel'
import { ExportButtons } from './components/ExportButtons'
import { ReferenceExactUploader } from './components/ReferenceExactUploader'
import { BracketKeywordCopyTable } from './components/BracketKeywordCopyTable'
import { ResultsTables } from './components/ResultsTables'
import { ManualKeywordsVsReference } from './components/ManualKeywordsVsReference'
import { Uploader } from './components/Uploader'
import { normalize } from '../utils/normalize'
import {
  lookupReferenceMetrics,
  manualExactKeywordSegmentsFromLines,
  normalizeCampaignNameForMatch,
  type ReferenceExactResult,
} from './utils/referenceExact'

interface AutoExactPageProps {
  profiles: TopicProfile[]
}

const CUSTOM_MANUAL_KEYWORDS_LABEL = 'CUSTOM MANUAL KEYWORDS'

/** Minimal Search Term report shape so `getHeaderSuggestions` maps required columns without a CSV upload. */
function buildSyntheticManualOnlyRows(lines: string[]): string[][] {
  const header = ['Search Term', 'Spend', 'Sales', 'Orders']
  return [header, ...lines.map((t) => [t, '', '', ''])]
}

function padRowToWidth(row: string[], width: number): string[] {
  if (row.length >= width) return row.slice(0, width)
  return [...row, ...Array(width - row.length).fill('')]
}

function mergeCsvRowsWithManualLines(
  csvRows: string[][],
  manualKeywordSegments: string[],
  mapping: ColumnMapping
): string[][] {
  if (manualKeywordSegments.length === 0) return csvRows
  if (csvRows.length === 0) return buildSyntheticManualOnlyRows(manualKeywordSegments)

  const header0 = csvRows[0] ?? []
  let w = header0.length
  for (let i = 1; i < csvRows.length; i++) {
    w = Math.max(w, csvRows[i]?.length ?? 0)
  }
  const idxs: number[] = [
    mapping.searchTerm,
    mapping.spend,
    mapping.sales,
    mapping.orders,
    mapping.clicks,
    mapping.impressions,
    mapping.cpc,
    mapping.campaignName,
    mapping.adGroupName,
    mapping.matchType,
    mapping.targeting,
    mapping.roas,
  ]
  for (const idx of idxs) {
    if (idx >= 0) w = Math.max(w, idx + 1)
  }

  const header = padRowToWidth(header0, w)
  const body = csvRows.slice(1).map((r) => padRowToWidth(r, w))
  const manualRows = manualKeywordSegments.map((term) => {
    const r: string[] = Array(w).fill('')
    const st = mapping.searchTerm
    if (st >= 0 && st < w) r[st] = term
    return r
  })
  return [header, ...body, ...manualRows]
}

/** Placeholder scored row so BracketKeywordCopyTable can render manual “not in reference” picks like Promote rows. */
function scoredStubForManualExport(originalTerm: string, normalizedTerm: string): ScoredTerm {
  return {
    normalizedTerm,
    originalTerm,
    spendSum: 0,
    salesSum: 0,
    ordersSum: 0,
    clicksSum: 0,
    impressionsSum: 0,
    campaignName: null,
    campaignNames: [],
    rowCount: 1,
    suggestedCpc: null,
    primaryMatchType: null,
    roas: null,
    acosPct: 0,
    cvrPct: null,
    confidence: 0,
    qualifies: false,
    inReviewQueue: false,
  }
}

export function AutoExactPage({ profiles }: AutoExactPageProps) {
  const [rows, setRows] = useState<string[][]>([])
  const [hasHeader, setHasHeader] = useState(true)
  const [mapping, setMapping] = useState<ColumnMapping>(DEFAULT_COLUMN_MAPPING)
  const [criteria, setCriteria] = useState<PromotionCriteria>(DEFAULT_CRITERIA)
  const [wrapInBrackets, setWrapInBrackets] = useState(false)
  const [aggregateByTerm, setAggregateByTerm] = useState(false)
  const [aggregateScope, setAggregateScope] = useState<SearchTermAggregateScope>('across_campaigns')
  const [selectedPromoteIndices, setSelectedPromoteIndices] = useState<Set<number>>(new Set())
  const [intent, setIntent] = useState('')
  const [asin, setAsin] = useState('')
  const [targetAcosForCpc, setTargetAcosForCpc] = useState(37)
  const [referenceExactData, setReferenceExactData] = useState<ReferenceExactResult | null>(null)
  const [hideAlreadyExact, setHideAlreadyExact] = useState(false)
  const [analyzed, setAnalyzed] = useState(false)
  const [sourceCsvNames, setSourceCsvNames] = useState<string[]>([])
  const [manualKeywordText, setManualKeywordText] = useState('')
  const [includePhrase, setIncludePhrase] = useState('')
  const [excludePhrase, setExcludePhrase] = useState('')
  const [selectedManualNotInRefIndices, setSelectedManualNotInRefIndices] = useState<Set<number>>(new Set())
  const prevHadCsvRows = useRef(false)
  const prevManualNonEmpty = useRef(false)

  const handleRowsLoaded = useCallback(
    (newRows: string[][], firstRowIsHeader: boolean, meta?: { sourceFileNames?: string[] }) => {
      setRows(newRows)
      setHasHeader(firstRowIsHeader)
      if (newRows.length > 0) {
        const suggested = getHeaderSuggestions(newRows)
        setMapping(suggested)
      }
      setSourceCsvNames(meta?.sourceFileNames ?? [])
      if (meta?.sourceFileNames && meta.sourceFileNames.length > 1) {
        setAggregateByTerm(true)
        setAggregateScope('across_campaigns')
      }
      setAnalyzed(false)
    },
    []
  )

  const manualLinesRaw = useMemo(
    () => manualKeywordText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
    [manualKeywordText]
  )

  const manualKeywordSegments = useMemo(
    () => manualExactKeywordSegmentsFromLines(manualLinesRaw),
    [manualLinesRaw]
  )

  const effectiveRows = useMemo(
    () => mergeCsvRowsWithManualLines(rows, manualKeywordSegments, mapping),
    [rows, manualKeywordSegments, mapping]
  )

  const effectiveRowsWithoutReferenceCampaigns = useMemo(() => {
    if (effectiveRows.length === 0) return effectiveRows
    const excludedCampaigns = referenceExactData?.campaignNamesInReference
    if (!excludedCampaigns || excludedCampaigns.size === 0) return effectiveRows
    if (mapping.campaignName < 0) return effectiveRows

    const [header, ...body] = effectiveRows
    const filteredBody = body.filter((row) => {
      const rawCampaign = row[mapping.campaignName] ?? ''
      const normCampaign = normalizeCampaignNameForMatch(rawCampaign)
      if (!normCampaign) return true
      return !excludedCampaigns.has(normCampaign)
    })
    return [header, ...filteredBody]
  }, [effectiveRows, mapping.campaignName, referenceExactData?.campaignNamesInReference])

  useEffect(() => {
    const csvEmpty = rows.length === 0
    const manualNonEmpty = manualKeywordSegments.length > 0
    if (csvEmpty && manualNonEmpty) {
      const syn = buildSyntheticManualOnlyRows(manualKeywordSegments)
      const shouldApply =
        (!prevManualNonEmpty.current && manualNonEmpty) ||
        (prevHadCsvRows.current && rows.length === 0)
      if (shouldApply) {
        setMapping(getHeaderSuggestions(syn))
        setHasHeader(true)
      }
    }
    prevHadCsvRows.current = rows.length > 0
    prevManualNonEmpty.current = manualNonEmpty
  }, [rows.length, manualKeywordSegments])

  useEffect(() => {
    setAnalyzed(false)
    setSelectedManualNotInRefIndices(new Set())
  }, [manualKeywordText])

  useEffect(() => {
    if (aggregateByTerm && aggregateScope === 'within_campaign' && mapping.campaignName < 0) {
      setAggregateScope('across_campaigns')
    }
  }, [aggregateByTerm, aggregateScope, mapping.campaignName])

  useEffect(() => {
    setAnalyzed(false)
  }, [aggregateByTerm, aggregateScope])

  useEffect(() => {
    setAnalyzed(false)
  }, [includePhrase, excludePhrase])

  const missingRequired = useMemo(() => getMissingRequired(mapping), [mapping])
  const hasAnySourceRows = effectiveRows.length > (hasHeader ? 1 : 0)
  const hasAnySourceRowsAfterReferenceFilter =
    effectiveRowsWithoutReferenceCampaigns.length > (hasHeader ? 1 : 0)
  const canAnalyze = hasAnySourceRowsAfterReferenceFilter && missingRequired.length === 0

  const aggregated = useMemo(() => {
    if (effectiveRowsWithoutReferenceCampaigns.length <= (hasHeader ? 1 : 0) || missingRequired.length > 0) return []
    return aggregateByTerm
      ? aggregateByNormalizedTerm(
          effectiveRowsWithoutReferenceCampaigns,
          mapping,
          hasHeader,
          aggregateScope
        )
      : oneRowPerCsvRow(effectiveRowsWithoutReferenceCampaigns, mapping, hasHeader)
  }, [
    effectiveRowsWithoutReferenceCampaigns,
    mapping,
    hasHeader,
    missingRequired.length,
    aggregateByTerm,
    aggregateScope,
  ])

  const scored = useMemo(() => runScoring(aggregated, criteria, profiles), [aggregated, criteria, profiles])
  const filteredScored = useMemo(() => {
    const includeNorm = normalize(includePhrase)
    const excludeNorm = normalize(excludePhrase)
    if (!includeNorm && !excludeNorm) return scored
    return scored.filter((row) => {
      const t = row.normalizedTerm
      if (includeNorm && !t.includes(includeNorm)) return false
      if (excludeNorm && t.includes(excludeNorm)) return false
      return true
    })
  }, [scored, includePhrase, excludePhrase])
  const promoteList = useMemo(() => getPromoteList(filteredScored), [filteredScored])
  const reviewQueue = useMemo(() => getReviewQueue(filteredScored), [filteredScored])

  const referenceNormalizedTerms = referenceExactData?.normalizedTermsInReference ?? new Set<string>()
  const referenceTargetCount = referenceExactData?.keywords.size ?? 0

  const displayList = useMemo(() => {
    if (!hideAlreadyExact || referenceNormalizedTerms.size === 0) return promoteList
    return promoteList.filter((r) => !referenceNormalizedTerms.has(r.normalizedTerm))
  }, [promoteList, hideAlreadyExact, referenceNormalizedTerms])

  useEffect(() => {
    setSelectedPromoteIndices(new Set(displayList.map((_, i) => i)))
  }, [displayList])

  const selectedPromoteList = useMemo(
    () => displayList.filter((_, i) => selectedPromoteIndices.has(i)),
    [displayList, selectedPromoteIndices]
  )

  const combinedBracketExportTerms = useMemo(() => {
    const map = referenceExactData?.metricsByKeyword ?? null
    const asinFilter = asin.trim() || null
    const extras: ScoredTerm[] = []
    for (const index of selectedManualNotInRefIndices) {
      const seg = manualKeywordSegments[index]
      if (!seg) continue
      const norm = normalize(seg)
      if (!norm) continue
      if (lookupReferenceMetrics(map, norm, asinFilter)) continue
      extras.push(scoredStubForManualExport(seg, norm))
    }
    return [...selectedPromoteList, ...extras]
  }, [
    selectedPromoteList,
    selectedManualNotInRefIndices,
    manualKeywordSegments,
    referenceExactData?.metricsByKeyword,
    asin,
  ])

  const hasClicks = mapping.clicks >= 0 && hasAnySourceRows

  const handleAnalyze = useCallback(() => {
    setAnalyzed(true)
  }, [])

  return (
    <div className="auto-exact-tab">
      <div className="auto-exact-page-top">
        <Uploader
          currentRows={rows}
          sourceCsvNames={sourceCsvNames}
          onRowsLoaded={handleRowsLoaded}
          manualKeywordText={manualKeywordText}
          onManualKeywordTextChange={setManualKeywordText}
        />
        <ReferenceExactUploader
          onDataLoaded={setReferenceExactData}
          campaignRowCount={referenceExactData?.campaignRowCount ?? 0}
          uniqueKeywordCount={referenceTargetCount}
          referenceFormat={referenceExactData?.referenceFormat}
        />
      </div>

      {manualKeywordSegments.length > 0 && (
        <ManualKeywordsVsReference
          manualSegments={manualKeywordSegments}
          referenceExactData={referenceExactData}
          exportAsin={asin}
          onExportAsinChange={setAsin}
          selectedNotInRefIndices={selectedManualNotInRefIndices}
          onSelectedNotInRefChange={setSelectedManualNotInRefIndices}
        />
      )}

      {hasAnySourceRows && (
        <>
          <ColumnMapper
            rows={effectiveRows}
            mapping={mapping}
            onMappingChange={setMapping}
            missingRequired={missingRequired}
            includePhrase={includePhrase}
            excludePhrase={excludePhrase}
            onIncludePhraseChange={setIncludePhrase}
            onExcludePhraseChange={setExcludePhrase}
          />
          <CriteriaPanel criteria={criteria} onCriteriaChange={setCriteria} />

          <div className="auto-exact-aggregate-option">
            <label className="auto-exact-aggregate-main">
              <input
                type="checkbox"
                checked={aggregateByTerm}
                onChange={(e) => setAggregateByTerm(e.target.checked)}
              />
              Aggregate by search term (sum metrics when the same term appears in multiple rows)
            </label>
            {aggregateByTerm && (
              <fieldset className="auto-exact-aggregate-scope">
                <legend className="sr-only">How to aggregate by search term</legend>
                <div className="auto-exact-aggregate-scope-options">
                  <label className="auto-exact-aggregate-radio">
                    <input
                      type="radio"
                      name="auto-exact-aggregate-scope"
                      value="across_campaigns"
                      checked={aggregateScope === 'across_campaigns'}
                      onChange={() => setAggregateScope('across_campaigns')}
                    />
                    Across all campaigns (one row per search term, totals combined)
                  </label>
                  <label
                    className={`auto-exact-aggregate-radio${mapping.campaignName < 0 ? ' auto-exact-aggregate-radio--disabled' : ''}`}
                  >
                    <input
                      type="radio"
                      name="auto-exact-aggregate-scope"
                      value="within_campaign"
                      checked={aggregateScope === 'within_campaign'}
                      disabled={mapping.campaignName < 0}
                      onChange={() => setAggregateScope('within_campaign')}
                    />
                    Within each campaign (same term in different campaigns stays on separate rows)
                  </label>
                </div>
                {mapping.campaignName < 0 && (
                  <p className="auto-exact-aggregate-scope-hint muted">
                    Map <strong>Campaign Name</strong> in column mapping to use within-campaign aggregation.
                  </p>
                )}
              </fieldset>
            )}
            <p className="auto-exact-aggregate-hint">
              Default: one row per CSV row so numbers match your file. Turn on aggregation, then choose whether to sum
              the term globally or separately per campaign.
            </p>
          </div>
          <div className="auto-exact-analyze">
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleAnalyze}
              disabled={!canAnalyze}
            >
              Analyze
            </button>
            {!canAnalyze && missingRequired.length > 0 && (
              <span className="muted"> Map required columns (Search Term, Spend, Sales, Orders) first.</span>
            )}
          </div>

          {analyzed && (
            <>
              <ExportButtons
                wrapInBrackets={wrapInBrackets}
                onWrapInBracketsChange={setWrapInBrackets}
                intent={intent}
                onIntentChange={setIntent}
                asin={asin}
                onAsinChange={setAsin}
                targetAcosForCpc={targetAcosForCpc}
                onTargetAcosForCpcChange={setTargetAcosForCpc}
                bracketCopySection={
                  wrapInBrackets ? (
                    <BracketKeywordCopyTable
                      selectedTerms={combinedBracketExportTerms}
                      intent={intent}
                      asin={asin}
                      embedded
                    />
                  ) : null
                }
              />
              <div className="auto-exact-hide-exact-bar">
                <label className="auto-exact-hide-exact-toggle">
                  <input
                    type="checkbox"
                    checked={hideAlreadyExact}
                    onChange={(e) => setHideAlreadyExact(e.target.checked)}
                    disabled={referenceNormalizedTerms.size === 0}
                  />
                  Hide keywords already in Exact campaigns
                </label>
                {referenceNormalizedTerms.size === 0 && (
                  <span className="muted"> Upload Reference Exact CSV above to enable.</span>
                )}
                {hideAlreadyExact && referenceNormalizedTerms.size > 0 && (
                  <span className="auto-exact-hide-exact-hint">
                    Showing {displayList.length} of {promoteList.length} keywords (excluding terms found in reference for any product).
                  </span>
                )}
              </div>
              <ResultsTables
                promoteList={displayList}
                reviewQueue={reviewQueue}
                hasClicks={hasClicks}
                targetAcosForCpc={targetAcosForCpc}
                selectedIndices={selectedPromoteIndices}
                onSelectionChange={setSelectedPromoteIndices}
                referenceExactMetrics={referenceExactData?.metricsByKeyword ?? null}
                referenceExportAsin={asin}
              />
            </>
          )}
        </>
      )}

      {!hasAnySourceRows && (
        <p className="muted auto-exact-empty-hint">Load Source CSVs or enter {CUSTOM_MANUAL_KEYWORDS_LABEL} above to continue.</p>
      )}
    </div>
  )
}
