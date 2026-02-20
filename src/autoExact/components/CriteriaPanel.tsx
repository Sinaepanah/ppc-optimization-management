import type { TopicProfile } from '../../types'
import type { PromotionCriteria } from '../types'

interface CriteriaPanelProps {
  criteria: PromotionCriteria
  onCriteriaChange: (c: PromotionCriteria) => void
  profiles: TopicProfile[]
}

export function CriteriaPanel({ criteria, onCriteriaChange, profiles }: CriteriaPanelProps) {
  const update = (patch: Partial<PromotionCriteria>) => {
    onCriteriaChange({ ...criteria, ...patch })
  }

  return (
    <section className="panel auto-exact-criteria">
      <h3>Promotion criteria</h3>
      <p className="panel-desc">Terms must meet all enabled thresholds to appear in Promote to Exact.</p>

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
            max={100}
            value={criteria.maxACoS}
            onChange={(e) => update({ maxACoS: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) })}
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

      <div className="auto-exact-criteria-block">
        <label>
          <input
            type="checkbox"
            checked={criteria.excludeBranded}
            onChange={(e) => update({ excludeBranded: e.target.checked })}
          />
          Exclude branded terms
        </label>
        {criteria.excludeBranded && (
          <textarea
            placeholder="One brand token per line (e.g. brand name)"
            value={criteria.brandTokens.join('\n')}
            onChange={(e) => update({ brandTokens: e.target.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) })}
            rows={3}
          />
        )}
      </div>

      <div className="auto-exact-criteria-block">
        <label>
          <input
            type="checkbox"
            checked={criteria.excludeIrrelevant}
            onChange={(e) => update({ excludeIrrelevant: e.target.checked })}
          />
          Exclude irrelevant topics
        </label>
        {criteria.excludeIrrelevant && (
          <>
            {profiles.length > 0 ? (
              <div className="auto-exact-criteria-row">
                <label>Use Relevancy profile</label>
                <select
                  value={criteria.irrelevantProfileId ?? ''}
                  onChange={(e) => update({ irrelevantProfileId: e.target.value || null })}
                >
                  <option value="">— Select profile —</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            ) : null}
            {(!criteria.irrelevantProfileId || profiles.length === 0) && (
              <textarea
                placeholder="Or list exclude phrases (one per line)"
                value={criteria.irrelevantTokenList.join('\n')}
                onChange={(e) =>
                  update({
                    irrelevantTokenList: e.target.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
                  })
                }
                rows={2}
              />
            )}
          </>
        )}
      </div>
    </section>
  )
}
