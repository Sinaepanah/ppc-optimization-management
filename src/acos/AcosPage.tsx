import { useMemo, useState } from 'react'
import { calculateSuggestedBid, validateAcosInputs } from './utils/calculator'

interface AcosInputs {
  currentCpc: string
  currentAcos: string
  targetAcos: string
  clicks: string
  orders: string
  asp: string
  currentBid: string
}

export function AcosPage() {
  const [inputs, setInputs] = useState<AcosInputs>({
    currentCpc: '',
    currentAcos: '',
    targetAcos: '35',
    clicks: '',
    orders: '',
    asp: '35',
    currentBid: '',
  })
  const [useCurrentBidForCaps, setUseCurrentBidForCaps] = useState(false)

  const parsed = useMemo(() => {
    const parse = (s: string) => parseFloat(String(s).replace(',', '.')) || 0
    return {
      currentCpc: parse(inputs.currentCpc),
      currentAcos: parse(inputs.currentAcos),
      targetAcos: parse(inputs.targetAcos),
      clicks: parse(inputs.clicks),
      orders: parse(inputs.orders),
      asp: parse(inputs.asp),
      currentBid: parse(inputs.currentBid),
    }
  }, [inputs])

  const validationErrors = useMemo(() => validateAcosInputs(parsed), [parsed])

  const result = useMemo(() => {
    if (validationErrors.length > 0) return null
    return calculateSuggestedBid({ ...parsed, useCurrentBidForCaps })
  }, [parsed, useCurrentBidForCaps, validationErrors.length])

  return (
    <div className="acos-tab">
      <section className="panel">
        <h2>ACOS Optimizer</h2>
        <p className="panel-desc">
          Enter your campaign metrics. Suggested bid updates live. All values are available from Amazon reports.
        </p>

        <div className="acos-grid">
          <div className="acos-form">
            <div className="acos-field">
              <label htmlFor="acos-current-cpc">Current CPC ($)</label>
              <div className="acos-input-with-prefix">
                <span className="acos-prefix">$</span>
                <input
                  id="acos-current-cpc"
                  type="number"
                  step="0.01"
                  min="0"
                  value={inputs.currentCpc}
                  onChange={(e) => setInputs((prev) => ({ ...prev, currentCpc: e.target.value }))}
                />
              </div>
            </div>

            <div className="acos-field">
              <label htmlFor="acos-current-bid">Current Bid ($)</label>
              <div className="acos-input-with-prefix">
                <span className="acos-prefix">$</span>
                <input
                  id="acos-current-bid"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Optional"
                  value={inputs.currentBid}
                  onChange={(e) => setInputs((prev) => ({ ...prev, currentBid: e.target.value }))}
                />
              </div>
              <label className="acos-toggle">
                <input
                  type="checkbox"
                  checked={useCurrentBidForCaps}
                  onChange={(e) => setUseCurrentBidForCaps(e.target.checked)}
                />
                Use Current Bid instead of Current CPC for caps
              </label>
            </div>

            <div className="acos-field">
              <label htmlFor="acos-current-acos">Current ACOS (%)</label>
              <div className="acos-input-with-suffix">
                <input
                  id="acos-current-acos"
                  type="number"
                  step="0.1"
                  min="0"
                  value={inputs.currentAcos}
                  onChange={(e) => setInputs((prev) => ({ ...prev, currentAcos: e.target.value }))}
                />
                <span className="acos-suffix">%</span>
              </div>
            </div>

            <div className="acos-field">
              <label htmlFor="acos-target-acos">Target ACOS (%)</label>
              <div className="acos-input-with-suffix">
                <input
                  id="acos-target-acos"
                  type="number"
                  step="0.1"
                  min="0"
                  value={inputs.targetAcos}
                  onChange={(e) => setInputs((prev) => ({ ...prev, targetAcos: e.target.value }))}
                />
                <span className="acos-suffix">%</span>
              </div>
            </div>

            <div className="acos-field">
              <label htmlFor="acos-clicks">Clicks</label>
              <input
                id="acos-clicks"
                type="number"
                step="1"
                min="1"
                value={inputs.clicks}
                onChange={(e) => setInputs((prev) => ({ ...prev, clicks: e.target.value }))}
              />
            </div>

            <div className="acos-field">
              <label htmlFor="acos-orders">Orders</label>
              <input
                id="acos-orders"
                type="number"
                step="1"
                min="0"
                value={inputs.orders}
                onChange={(e) => setInputs((prev) => ({ ...prev, orders: e.target.value }))}
              />
            </div>

            <div className="acos-field">
              <label htmlFor="acos-asp">Average Selling Price (ASP) ($)</label>
              <div className="acos-input-with-prefix">
                <span className="acos-prefix">$</span>
                <input
                  id="acos-asp"
                  type="number"
                  step="0.01"
                  min="0"
                  value={inputs.asp}
                  onChange={(e) => setInputs((prev) => ({ ...prev, asp: e.target.value }))}
                />
              </div>
            </div>

            {validationErrors.length > 0 && (
              <div className="acos-validation">
                {validationErrors.map((e) => (
                  <p key={e.field} className="acos-validation-error">
                    {e.message}
                  </p>
                ))}
              </div>
            )}
          </div>

          <div className="acos-result">
            <h3>Suggested bid</h3>
            {result ? (
              <>
                <p className="acos-result-main">
                  <strong>${result.suggestedBidFinal.toFixed(2)}</strong>
                  {result.capStatus !== 'none' && (
                    <span className="acos-cap-status">
                      CAPPED by guardrail — {result.capStatus === 'decrease' ? 'Decrease cap' : 'Increase cap'}
                    </span>
                  )}
                </p>
                <div className="acos-calculation-details">
                  <h4>Calculation details</h4>
                  <p>
                    <span className="acos-result-label">CVR</span>
                    <strong>{(result.cvr * 100).toFixed(2)}%</strong>
                  </p>
                  <p>
                    <span className="acos-result-label">Max CPC (Value)</span>
                    <strong>${result.maxCpcValue.toFixed(2)}</strong>
                  </p>
                  <p>
                    <span className="acos-result-label">CPC (ACOS Adjusted)</span>
                    <strong>${result.cpcAcosAdjusted.toFixed(2)}</strong>
                  </p>
                  <p>
                    <span className="acos-result-label">Suggested Core (uncapped)</span>
                    <strong>${result.suggestedCore.toFixed(2)}</strong>
                  </p>
                  <p>
                    <span className="acos-result-label">Suggested Bid (final)</span>
                    <strong>${result.suggestedBidFinal.toFixed(2)}</strong>
                  </p>
                </div>
              </>
            ) : (
              <p className="muted">Enter values on the left — the suggested bid updates live as you type.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
