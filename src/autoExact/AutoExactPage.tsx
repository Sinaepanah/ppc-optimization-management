import { useCallback, useEffect, useMemo, useState } from 'react'
import type { TopicProfile } from '../types'
import { aggregateByNormalizedTerm, oneRowPerCsvRow } from './utils/aggregation'
import { getHeaderSuggestions } from './utils/csvHelpers'
import { getPromoteList, getReviewQueue, runScoring } from './utils/scoring'
import type { ColumnMapping, PromotionCriteria } from './types'
import { DEFAULT_COLUMN_MAPPING, DEFAULT_CRITERIA } from './types'
import { ColumnMapper, getMissingRequired } from './components/ColumnMapper'
import { CriteriaPanel } from './components/CriteriaPanel'
import { ExportButtons } from './components/ExportButtons'
import { ReferenceExactUploader } from './components/ReferenceExactUploader'
import { BracketKeywordCopyTable } from './components/BracketKeywordCopyTable'
import { ResultsTables } from './components/ResultsTables'
import { Uploader } from './components/Uploader'
import type { ReferenceExactResult } from './utils/referenceExact'

interface AutoExactPageProps {
  profiles: TopicProfile[]
}

export function AutoExactPage({ profiles }: AutoExactPageProps) {
  const [rows, setRows] = useState<string[][]>([])
  const [hasHeader, setHasHeader] = useState(true)
  const [mapping, setMapping] = useState<ColumnMapping>(DEFAULT_COLUMN_MAPPING)
  const [criteria, setCriteria] = useState<PromotionCriteria>(DEFAULT_CRITERIA)
  const [wrapInBrackets, setWrapInBrackets] = useState(false)
  const [aggregateByTerm, setAggregateByTerm] = useState(false)
  const [selectedPromoteIndices, setSelectedPromoteIndices] = useState<Set<number>>(new Set())
  const [intent, setIntent] = useState('')
  const [asin, setAsin] = useState('')
  const [targetAcosForCpc, setTargetAcosForCpc] = useState(37)
  const [referenceExactData, setReferenceExactData] = useState<ReferenceExactResult | null>(null)
  const [hideAlreadyExact, setHideAlreadyExact] = useState(false)
  const [analyzed, setAnalyzed] = useState(false)
  const [sourceCsvNames, setSourceCsvNames] = useState<string[]>([])

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
      }
      setAnalyzed(false)
    },
    []
  )

  const missingRequired = useMemo(() => getMissingRequired(mapping), [mapping])
  const canAnalyze = rows.length > 0 && missingRequired.length === 0

  const aggregated = useMemo(() => {
    if (rows.length === 0 || missingRequired.length > 0) return []
    return aggregateByTerm
      ? aggregateByNormalizedTerm(rows, mapping, hasHeader)
      : oneRowPerCsvRow(rows, mapping, hasHeader)
  }, [rows, mapping, hasHeader, missingRequired.length, aggregateByTerm])

  const scored = useMemo(() => runScoring(aggregated, criteria, profiles), [aggregated, criteria, profiles])
  const promoteList = useMemo(() => getPromoteList(scored), [scored])
  const reviewQueue = useMemo(() => getReviewQueue(scored), [scored])

  const referenceExactKeywords = referenceExactData?.keywords ?? new Set<string>()

  const displayList = useMemo(() => {
    if (!hideAlreadyExact || referenceExactKeywords.size === 0) return promoteList
    return promoteList.filter((r) => !referenceExactKeywords.has(r.normalizedTerm))
  }, [promoteList, hideAlreadyExact, referenceExactKeywords])

  useEffect(() => {
    setSelectedPromoteIndices(new Set(displayList.map((_, i) => i)))
  }, [displayList])

  const selectedPromoteList = useMemo(
    () => displayList.filter((_, i) => selectedPromoteIndices.has(i)),
    [displayList, selectedPromoteIndices]
  )

  const hasClicks = mapping.clicks >= 0 && rows.length > 0

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
        />
        <ReferenceExactUploader
          onDataLoaded={setReferenceExactData}
          campaignRowCount={referenceExactData?.campaignRowCount ?? 0}
          uniqueKeywordCount={referenceExactKeywords.size}
        />
      </div>

      {rows.length > 0 && (
        <>
          <ColumnMapper
            rows={rows}
            mapping={mapping}
            onMappingChange={setMapping}
            missingRequired={missingRequired}
          />
          <CriteriaPanel criteria={criteria} onCriteriaChange={setCriteria} />

          <div className="auto-exact-aggregate-option">
            <label>
              <input
                type="checkbox"
                checked={aggregateByTerm}
                onChange={(e) => setAggregateByTerm(e.target.checked)}
              />
              Aggregate by search term (sum metrics when same term appears in multiple rows)
            </label>
            <p className="auto-exact-aggregate-hint">
              Default: one row per CSV row so numbers match your file. Turn on to combine rows with the same search term.
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
                      selectedTerms={selectedPromoteList}
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
                    disabled={referenceExactKeywords.size === 0}
                  />
                  Hide keywords already in Exact campaigns
                </label>
                {referenceExactKeywords.size === 0 && (
                  <span className="muted"> Upload Reference Exact CSV above to enable.</span>
                )}
                {hideAlreadyExact && referenceExactKeywords.size > 0 && (
                  <span className="auto-exact-hide-exact-hint">
                    Showing {displayList.length} of {promoteList.length} keywords (excluding {referenceExactKeywords.size} from reference).
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
              />
            </>
          )}
        </>
      )}

      {rows.length === 0 && <p className="muted auto-exact-empty-hint">Load Source CSVs above to continue.</p>}
    </div>
  )
}
