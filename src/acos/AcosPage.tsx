import { useMemo, useState } from 'react'
import { calculateSuggestedBid, validateAcosInputs } from './utils/calculator'

interface AcosInputs {
  clicks: string
  orders: string
  sellingPrice: string
  profitPerUnit: string
  targetAcos: string
}

export function AcosPage() {
  const [inputs, setInputs] = useState<AcosInputs>({
    clicks: '',
    orders: '',
    sellingPrice: '',
    profitPerUnit: '',
    targetAcos: '35',
  })

  const parsed = useMemo(() => {
    const parse = (s: string) => parseFloat(String(s).replace(',', '.')) || 0
    return {
      clicks: parse(inputs.clicks),
      orders: parse(inputs.orders),
      sellingPrice: parse(inputs.sellingPrice),
      profitPerUnit: parse(inputs.profitPerUnit),
      targetAcosPct: parse(inputs.targetAcos),
    }
  }, [inputs])

  const validationErrors = useMemo(
    () => validateAcosInputs({ ...parsed, targetAcosPct: parsed.targetAcosPct }),
    [parsed]
  )

  const result = useMemo(() => {
    if (validationErrors.length > 0) return null
    return calculateSuggestedBid({ ...parsed, targetAcosPct: parsed.targetAcosPct })
  }, [parsed, validationErrors.length])

  const canCalculate = validationErrors.length === 0

  return (
    <div className="acos-tab">
      <section className="panel">
        <h2>ACOS Optimizer</h2>
        <p className="panel-desc">
          Enter Clicks, Orders, Selling Price, and Profit Per Unit. Profit Per Unit is your profit per sale before ads
          — a single number, no cost breakdown. Suggested bid updates live.
        </p>

        <div className="acos-grid">
          <div className="acos-form">
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
              <label htmlFor="acos-selling-price">
                Selling Price
                <span className="muted"> ($)</span>
              </label>
              <div className="acos-input-with-prefix">
                <span className="acos-prefix">$</span>
                <input
                  id="acos-selling-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={inputs.sellingPrice}
                  onChange={(e) => setInputs((prev) => ({ ...prev, sellingPrice: e.target.value }))}
                />
              </div>
            </div>

            <div className="acos-field">
              <label htmlFor="acos-profit-per-unit">
                Profit Per Unit
                <span className="muted"> (before ads, $)</span>
              </label>
              <div className="acos-input-with-prefix">
                <span className="acos-prefix">$</span>
                <input
                  id="acos-profit-per-unit"
                  type="number"
                  step="0.01"
                  min="0"
                  value={inputs.profitPerUnit}
                  onChange={(e) => setInputs((prev) => ({ ...prev, profitPerUnit: e.target.value }))}
                />
              </div>
            </div>

            <div className="acos-field">
              <label htmlFor="acos-target-acos">
                Target ACOS
                <span className="muted"> (%)</span>
              </label>
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
                <div className="acos-result-grid">
                  <p>
                    <span className="acos-result-label">CVR</span>
                    <strong>{(result.cvr * 100).toFixed(2)}%</strong>
                  </p>
                  <p>
                    <span className="acos-result-label">Max CPC (ACOS)</span>
                    <strong>${result.maxCpcAcos.toFixed(2)}</strong>
                  </p>
                  <p>
                    <span className="acos-result-label">Max CPC (Profit)</span>
                    <strong>${result.maxCpcProfit.toFixed(2)}</strong>
                  </p>
                  <p className="acos-result-final">
                    <span className="acos-result-label">Suggested Bid</span>
                    <strong>${result.suggestedBid.toFixed(2)}</strong>
                  </p>
                </div>
                {result.lowDataApplied && (
                  <p className="acos-low-data">Low data protection applied (clicks &lt; 20): bid reduced by 30%.</p>
                )}
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
