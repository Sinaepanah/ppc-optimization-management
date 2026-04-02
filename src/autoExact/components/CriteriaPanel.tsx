import type { PromotionCriteria } from '../types'

interface CriteriaPanelProps {
  criteria: PromotionCriteria
  onCriteriaChange: (c: PromotionCriteria) => void
}

export function CriteriaPanel({ criteria, onCriteriaChange }: CriteriaPanelProps) {
  const update = (patch: Partial<PromotionCriteria>) => {
    onCriteriaChange({ ...criteria, ...patch })
  }

  return (
    <section className="panel auto-exact-criteria">
      <h3>Promotion criteria</h3>

      <div className="auto-exact-criteria-grid">
        <div className="auto-exact-criteria-row">
          <label>Minimum Orders</label>
          <input
            type="number"
            min={1}
            value={criteria.minOrders}
            onChange={(e) => update({ minOrders: Math.max(1, parseInt(e.target.value, 10) || 1) })}
          />
        </div>
        <div className="auto-exact-criteria-row">
          <label>Minimum Sales</label>
          <input
            type="number"
            min={0}
            step={10}
            value={criteria.minSales}
            onChange={(e) => update({ minSales: Math.max(0, parseFloat(e.target.value) || 0) })}
          />
        </div>
        <div className="auto-exact-criteria-row">
          <label>Maximum ACoS %</label>
          <input
            type="number"
            min={0}
            max={500}
            value={criteria.maxACoS}
            onChange={(e) => update({ maxACoS: Math.max(0, Math.min(500, parseFloat(e.target.value) || 0)) })}
          />
        </div>
        <div className="auto-exact-criteria-row auto-exact-criteria-toggle">
          <label>
            <input
              type="checkbox"
              checked={criteria.minClicksEnabled}
              onChange={(e) => update({ minClicksEnabled: e.target.checked })}
            />
            Minimum Clicks
          </label>
          {criteria.minClicksEnabled && (
            <input
              type="number"
              min={1}
              value={criteria.minClicks}
              onChange={(e) => update({ minClicks: Math.max(1, parseInt(e.target.value, 10) || 1) })}
            />
          )}
        </div>
        <div className="auto-exact-criteria-row auto-exact-criteria-toggle">
          <label>
            <input
              type="checkbox"
              checked={criteria.minCVREnabled}
              onChange={(e) => update({ minCVREnabled: e.target.checked })}
            />
            Minimum CVR %
          </label>
          {criteria.minCVREnabled && (
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={criteria.minCVR}
              onChange={(e) => update({ minCVR: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) })}
            />
          )}
        </div>
      </div>
    </section>
  )
}
