import { useState, useMemo } from 'react'
import { optimize, type OptimizationResult } from './utils/optimizer'
import { NumberInputWithArrows } from './components/NumberInputWithArrows'
import type { ExtractedPlacementData } from './utils/placementParser'

interface OptimizationPanelProps {
  adLevelData: Record<string, string>
  placementData: ExtractedPlacementData | null
}

export function OptimizationPanel({ adLevelData, placementData }: OptimizationPanelProps) {
  const [targetAcos, setTargetAcos] = useState('35')

  const result = useMemo((): OptimizationResult | null => {
    const target = parseFloat(targetAcos.replace(/[%,\s]/g, '')) || 35
    return optimize(adLevelData, placementData, target)
  }, [adLevelData, placementData, targetAcos])

  const hasAdLevelData = Boolean(
    adLevelData?.bid && adLevelData?.clicks && parseFloat(String(adLevelData.bid).replace(/[$,£]/g, '')) > 0
  )

  if (!hasAdLevelData) {
    return (
      <div className="ppc-optimization-panel ppc-optimization-panel--empty">
        <h3>PPC Bid Optimization</h3>
        <p className="ppc-optimization-hint">
          Add ad-level data above (upload an image or paste a screenshot) to get bid suggestions.
        </p>
      </div>
    )
  }

  return (
    <div className="ppc-optimization-panel">
      <h3>PPC Bid Optimization</h3>
      <p className="ppc-optimization-desc">
        Two-layer optimization: base bid (profitability) first, then placement adjustments (traffic distribution).
      </p>

      <div className="ppc-optimization-controls">
        <div className="ppc-field">
          <label htmlFor="ppc-target-acos">Target ACoS (%)</label>
          <NumberInputWithArrows
            id="ppc-target-acos"
            value={targetAcos}
            onChange={setTargetAcos}
            type="percent"
            suffix="%"
            placeholder="35"
          />
        </div>
      </div>

      {result && (
        <div className="ppc-optimization-results">
          <section className="ppc-optimization-layer ppc-optimization-layer--1">
            <h4>Layer 1: Base Bid</h4>
            <div className={`ppc-status-badge ppc-status-badge--${result.layer1.status}`}>
              {result.layer1.status.replace('-', ' ')}
            </div>
            <p className="ppc-optimization-rationale">{result.layer1.rationale}</p>
            <div className="ppc-optimization-metrics">
              <div className="ppc-metric">
                <span className="ppc-metric-label">Suggested base bid</span>
                <span className="ppc-metric-value ppc-metric-value--primary">
                  ${result.layer1.suggestedBaseBid.toFixed(2)}
                </span>
                {Math.abs(result.layer1.changePercent) > 0.5 && (
                  <span
                    className={`ppc-change-badge ${result.layer1.changePercent > 0 ? 'ppc-change-badge--up' : 'ppc-change-badge--down'}`}
                  >
                    {result.layer1.changePercent > 0 ? '+' : ''}
                    {result.layer1.changePercent.toFixed(1)}%
                  </span>
                )}
              </div>
              <div className="ppc-metric">
                <span className="ppc-metric-label">Economic max CPC</span>
                <span className="ppc-metric-value">${result.layer1.economicMaxCpc.toFixed(2)}</span>
              </div>
              <div className="ppc-metric">
                <span className="ppc-metric-label">ROAS</span>
                <span className="ppc-metric-value">{result.layer1.roas.toFixed(2)}</span>
              </div>
              <div className="ppc-metric">
                <span className="ppc-metric-label">Target ROAS</span>
                <span className="ppc-metric-value">{result.layer1.targetRoas.toFixed(2)}</span>
              </div>
              <div className="ppc-metric">
                <span className="ppc-metric-label">CVR</span>
                <span className="ppc-metric-value">{(result.layer1.cvr * 100).toFixed(2)}%</span>
              </div>
            </div>
          </section>

          {result.layer2.hasPlacementData && (
            <section className="ppc-optimization-layer ppc-optimization-layer--2">
              <h4>Layer 2: Placement Bid Adjustments</h4>
              <p className="ppc-optimization-hint">
                {result.layer1.status === 'unprofitable'
                  ? 'Shifting traffic toward profitable placements can improve overall ACoS. Amplify strong placements, reduce weak ones.'
                  : 'Adjustments are percentages applied on top of the base bid for each placement.'}
              </p>
              <div className="ppc-placement-suggestions">
                  {(['topOfSearch', 'restOfSearch', 'productPages'] as const).map((key) => {
                    const p = result.layer2[key]
                    const labels = {
                      topOfSearch: 'Top of Search',
                      restOfSearch: 'Rest of Search',
                      productPages: 'Product Pages',
                    }
                    return (
                      <div key={key} className="ppc-placement-suggestion">
                        <div className="ppc-placement-suggestion-header">
                          <span className="ppc-placement-label">{labels[key]}</span>
                          <span className="ppc-placement-adj">
                            {p.suggestedAdjustment >= 0 ? '+' : ''}
                            {p.suggestedAdjustment}%
                          </span>
                          {Math.abs(p.changePercent) > 1 && (
                            <span
                              className={`ppc-change-badge ppc-change-badge--small ${
                                p.changePercent > 0 ? 'ppc-change-badge--up' : 'ppc-change-badge--down'
                              }`}
                            >
                              {p.changePercent > 0 ? '+' : ''}
                              {p.changePercent.toFixed(0)}%
                            </span>
                          )}
                        </div>
                        {p.rationale && <p className="ppc-placement-rationale">{p.rationale}</p>}
                      </div>
                    )
                  })}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
