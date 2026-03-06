/**
 * SQP (Search Query Performance) Page
 *
 * Required CSV structure (Amazon Brand Analytics):
 * - Row 0: Junk (skipped entirely)
 * - Row 1: Headers (Search Query, Impressions, Clicks, etc.)
 * - Row 2+: Data rows
 *
 * Common headers: Search Query, Search Query Volume, Impressions, Clicks,
 * Cart Adds, Purchases, Impression Share, Click Share, Cart Add Share, Purchase Share,
 * Market Impressions, Market Clicks, Market Cart Adds, Market Purchases.
 */

import { useCallback, useMemo, useState } from 'react'
import { parseSQPCsv } from './sqpCsvParser'
import { buildColumnMapping, getMappingErrors, getMappingAsinWarnings } from './sqpColumnMapping'
import { normalizeRow, computeMetrics } from './sqpMetrics'
import {
  runStrategy,
  STRATEGY_INFO,
  STRATEGY_DEFAULT_THRESHOLDS,
  type StrategyId,
  type StrategyConfig,
} from './sqpStrategies'
import { SQPSidebar } from './SQPSidebar'
import { SQPUploader } from './SQPUploader'
import { SQPTable } from './SQPTable'
import { SQPEmptyState } from './SQPEmptyState'
import { SQPErrorState } from './SQPErrorState'
import './SQP.css'

export function SQPPage() {
  const [csvText, setCsvText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [activeStrategy, setActiveStrategy] = useState<StrategyId>('overview')
  const [thresholdOverrides, setThresholdOverrides] = useState<
    Partial<
      Record<
        StrategyId,
        {
          minClicks: number
          minPurchases: number
          minSearchVolume: number
          minImpressions: number
          minCartAdds: number
        }
      >
    >
  >({})

  const thresholds: StrategyConfig = (() => {
    const def = STRATEGY_DEFAULT_THRESHOLDS[activeStrategy]
    const over = thresholdOverrides[activeStrategy]
    return {
      id: activeStrategy,
      label: STRATEGY_INFO[activeStrategy].label,
      description: STRATEGY_INFO[activeStrategy].description,
      minClicks: over?.minClicks ?? def.minClicks,
      minPurchases: over?.minPurchases ?? def.minPurchases,
      minSearchVolume: over?.minSearchVolume ?? def.minSearchVolume,
      minImpressions: over?.minImpressions ?? def.minImpressions,
      minCartAdds: over?.minCartAdds ?? def.minCartAdds,
      minPurchaseShare: activeStrategy === 'defendWinners' ? 0.15 : undefined,
      minPurchaseRate: activeStrategy === 'scaleConverters' ? 0.08 : activeStrategy === 'cartAddFriction' ? 0.05 : undefined,
      minCartAddRate: activeStrategy === 'cartAddFriction' ? 0.08 : undefined,
    }
  })()

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      setCsvText(text)
      setFileName(file.name)
    }
    reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }, [])

  const handleClear = useCallback(() => {
    setCsvText('')
    setFileName(null)
  }, [])

  const { parseError, asinColumnWarning, normalizedRows, strategyRows } = useMemo(() => {
    if (!csvText.trim()) {
      return { parseError: null, asinColumnWarning: null, normalizedRows: [], strategyRows: [] }
    }

    const result = parseSQPCsv(csvText)
    if ('message' in result) {
      return {
        parseError: result.message,
        asinColumnWarning: null,
        normalizedRows: [] as ReturnType<typeof computeMetrics>[],
        strategyRows: [],
      }
    }

    const mapping = buildColumnMapping(result.headers)
    const errs = getMappingErrors(mapping)
    if (errs.length > 0) {
      return {
        parseError: `Missing required columns: ${errs.join(', ')}`,
        asinColumnWarning: null,
        normalizedRows: [] as ReturnType<typeof computeMetrics>[],
        strategyRows: [],
      }
    }

    const asinColumnWarning = getMappingAsinWarnings(mapping)
    const normalizedRows = result.rows
      .map((r) => normalizeRow(r, mapping))
      .filter((r): r is NonNullable<ReturnType<typeof normalizeRow>> => r != null)
      .map((r) => computeMetrics(r))
    const cfg = thresholds
    const strategyRows = runStrategy(activeStrategy, normalizedRows, cfg)

    return { parseError: null, asinColumnWarning, normalizedRows, strategyRows }
  }, [csvText, activeStrategy, thresholds])

  const hasData = normalizedRows.length > 0
  const info = STRATEGY_INFO[activeStrategy]

  const updateThreshold = useCallback(
    (
      key:
        | 'minClicks'
        | 'minPurchases'
        | 'minSearchVolume'
        | 'minImpressions'
        | 'minCartAdds',
      value: number
    ) => {
      setThresholdOverrides((prev) => {
        const def = STRATEGY_DEFAULT_THRESHOLDS[activeStrategy]
        const current = prev[activeStrategy]
        return {
          ...prev,
          [activeStrategy]: {
            minClicks: current?.minClicks ?? def.minClicks,
            minPurchases: current?.minPurchases ?? def.minPurchases,
            minSearchVolume: current?.minSearchVolume ?? def.minSearchVolume,
            minImpressions: current?.minImpressions ?? def.minImpressions,
            minCartAdds: current?.minCartAdds ?? def.minCartAdds,
            [key]: value,
          },
        }
      })
    },
    [activeStrategy]
  )

  return (
    <div className="sqp-layout">
      <SQPSidebar activeStrategy={activeStrategy} onSelect={setActiveStrategy} />

      <div className="sqp-main">
        <div className="sqp-header">
          <SQPUploader
            onFileChange={handleFileChange}
            onClear={handleClear}
            fileName={fileName}
          />
        </div>

        {parseError && (
          <SQPErrorState message={parseError} />
        )}

        {!parseError && asinColumnWarning && hasData && (
          <div className="sqp-asin-warning" role="alert">
            {asinColumnWarning}
          </div>
        )}

        {!csvText && !parseError && <SQPEmptyState />}

        {hasData && !parseError && (
          <>
            {activeStrategy === 'overview' && (
              <div className="sqp-kpis">
                <div className="sqp-kpi">
                  <div className="sqp-kpi__value">
                    {normalizedRows.length.toLocaleString()}
                  </div>
                  <div className="sqp-kpi__label">Queries</div>
                </div>
                <div className="sqp-kpi">
                  <div className="sqp-kpi__value">
                    {normalizedRows
                      .reduce((s, r) => s + r.impressions, 0)
                      .toLocaleString()}
                  </div>
                  <div className="sqp-kpi__label">Total ASIN Impressions</div>
                </div>
                <div className="sqp-kpi">
                  <div className="sqp-kpi__value">
                    {normalizedRows
                      .reduce((s, r) => s + r.clicks, 0)
                      .toLocaleString()}
                  </div>
                  <div className="sqp-kpi__label">Total ASIN Clicks</div>
                </div>
                <div className="sqp-kpi">
                  <div className="sqp-kpi__value">
                    {normalizedRows
                      .reduce((s, r) => s + r.purchases, 0)
                      .toLocaleString()}
                  </div>
                  <div className="sqp-kpi__label">Total ASIN Purchases</div>
                </div>
              </div>
            )}

            <div className="sqp-panel">
              <h3 className="sqp-panel__title">{info.label}</h3>
              <p className="sqp-panel__desc">{info.description}</p>

              <div className="sqp-thresholds">
                  <div className="sqp-threshold">
                    <label htmlFor="sqp-min-clicks">Min Clicks</label>
                    <input
                      id="sqp-min-clicks"
                      type="number"
                      min={0}
                      value={thresholds.minClicks}
                      onChange={(e) =>
                        updateThreshold('minClicks', parseInt(e.target.value, 10) || 0)
                      }
                    />
                  </div>
                  <div className="sqp-threshold">
                    <label htmlFor="sqp-min-purchases">Min Purchases</label>
                    <input
                      id="sqp-min-purchases"
                      type="number"
                      min={0}
                      value={thresholds.minPurchases}
                      onChange={(e) =>
                        updateThreshold('minPurchases', parseInt(e.target.value, 10) || 0)
                      }
                    />
                  </div>
                  <div className="sqp-threshold">
                    <label htmlFor="sqp-min-vol">Min Search Vol</label>
                    <input
                      id="sqp-min-vol"
                      type="number"
                      min={0}
                      value={thresholds.minSearchVolume}
                      onChange={(e) =>
                        updateThreshold('minSearchVolume', parseInt(e.target.value, 10) || 0)
                      }
                    />
                  </div>
                  <div className="sqp-threshold">
                    <label htmlFor="sqp-min-impressions">Min Impressions (ASIN)</label>
                    <input
                      id="sqp-min-impressions"
                      type="number"
                      min={0}
                      value={thresholds.minImpressions}
                      onChange={(e) =>
                        updateThreshold('minImpressions', parseInt(e.target.value, 10) || 0)
                      }
                    />
                  </div>
                  <div className="sqp-threshold">
                    <label htmlFor="sqp-min-cart-adds">Min Add to Cart (ASIN)</label>
                    <input
                      id="sqp-min-cart-adds"
                      type="number"
                      min={0}
                      value={thresholds.minCartAdds}
                      onChange={(e) =>
                        updateThreshold('minCartAdds', parseInt(e.target.value, 10) || 0)
                      }
                    />
                  </div>
                </div>

              {strategyRows.length > 0 ? (
                <SQPTable rows={strategyRows} strategyId={activeStrategy} />
              ) : (
                <p className="sqp-missing-cols">
                  No rows match the current filters. Try lowering the thresholds (min clicks, min purchases, min search volume, min impressions, min add to cart).
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
