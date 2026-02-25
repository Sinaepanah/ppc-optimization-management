import { useMemo, useState } from 'react'

interface AcosInputs {
  currentCpc: string
  currentAcos: string
  targetAcos: string
}

interface AcosResult {
  recommendedCpc: number
  percentChange: number
}

function computeAcosRecommendation(currentCpc: number, currentAcos: number, targetAcos: number): AcosResult | null {
  if (currentCpc <= 0 || currentAcos <= 0 || targetAcos <= 0) return null

  // Simple proportional rule of thumb:
  // If conversion rate and AOV stay similar, ACOS moves roughly in proportion to CPC.
  // New CPC ~= current CPC * (target ACOS / current ACOS)
  const ratio = targetAcos / currentAcos
  const recommendedCpc = currentCpc * ratio
  const percentChange = ((recommendedCpc - currentCpc) / currentCpc) * 100

  return { recommendedCpc, percentChange }
}

export function AcosPage() {
  const [inputs, setInputs] = useState<AcosInputs>({
    currentCpc: '',
    currentAcos: '',
    targetAcos: '35',
  })

  const parsed = useMemo(() => {
    const currentCpc = parseFloat(inputs.currentCpc.replace(',', '.'))
    const currentAcos = parseFloat(inputs.currentAcos.replace(',', '.'))
    const targetAcos = parseFloat(inputs.targetAcos.replace(',', '.'))
    return { currentCpc, currentAcos, targetAcos }
  }, [inputs])

  const canCalculate =
    Number.isFinite(parsed.currentCpc) &&
    parsed.currentCpc > 0 &&
    Number.isFinite(parsed.currentAcos) &&
    parsed.currentAcos > 0 &&
    Number.isFinite(parsed.targetAcos) &&
    parsed.targetAcos > 0

  const result = useMemo(
    () => (canCalculate ? computeAcosRecommendation(parsed.currentCpc, parsed.currentAcos, parsed.targetAcos) : null),
    [canCalculate, parsed.currentCpc, parsed.currentAcos, parsed.targetAcos]
  )

  const changeLabel =
    result && result.percentChange !== 0
      ? result.percentChange > 0
        ? `Increase CPC by approximately ${result.percentChange.toFixed(1)}%`
        : `Decrease CPC by approximately ${Math.abs(result.percentChange).toFixed(1)}%`
      : null

  return (
    <div className="acos-tab">
      <section className="panel">
        <h2>ACOS Optimizer</h2>
        <p className="panel-desc">
          Input your current CPC and ACOS along with your target ACOS. The suggested bid updates live as you type.
        </p>

        <div className="acos-grid">
          <div className="acos-form">
            <div className="acos-field">
              <label htmlFor="acos-current-cpc">
                Current CPC
                <span className="muted"> (e.g. 0.75)</span>
              </label>
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
              <label htmlFor="acos-current-acos">
                Current ACOS
                <span className="muted"> (e.g. 45)</span>
              </label>
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
              <label htmlFor="acos-target-acos">
                Target ACOS
                <span className="muted"> (e.g. 30)</span>
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
          </div>

          <div className="acos-result">
            <h3>Suggested bid</h3>
            {result ? (
              <>
                <p className="acos-result-main">
                  Recommended CPC:{' '}
                  <strong>${result.recommendedCpc.toFixed(2)}</strong>{' '}
                  <span className="muted">(from ${parsed.currentCpc.toFixed(2)})</span>
                </p>
                {changeLabel && <p className="acos-result-change">{changeLabel}</p>}
                <p className="muted">
                  Rule of thumb: if your conversion rate and average order value stay similar, ACOS moves roughly in
                  proportion to CPC. This recommendation scales your bid from your current ACOS toward your target ACOS.
                </p>
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

