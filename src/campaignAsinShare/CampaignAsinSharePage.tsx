import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  parseExactCsvWithAsin,
  aggregateByAsin,
  getNumericMetricHeaders,
  type AsinAggregate,
} from './utils/asinShare'

/** Known ASIN → display name mapping */
const ASIN_DISPLAY_NAMES: Record<string, string> = {
  B0DV3ZG4N2: 'Drinking Water',
  B0G4HWY69V: 'Aquarium',
  B0G4HV1QDP: 'Pool and Spa',
}

function getAsinDisplayLabel(asin: string): string {
  const name = ASIN_DISPLAY_NAMES[asin]
  return name ? `${asin} — ${name}` : asin
}

function getAsinShortLabel(asin: string): string {
  return ASIN_DISPLAY_NAMES[asin] ?? asin
}

const CHART_COLORS = [
  '#6366f1', '#0d9488', '#059669', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#10b981', '#f97316', '#ec4899',
]

const SEGMENT_GAP = 1.5

/** Elegant donut chart with hover interactions and dynamic center display */
function SvgPieChart({
  data,
  colors,
  size = 360,
  getLabel,
  metricName = '',
}: {
  data: { name: string; value: number }[]
  colors: string[]
  size?: number
  getLabel: (asin: string) => string
  metricName?: string
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) return null
  const cx = size / 2
  const cy = size / 2
  const outerR = size / 2 - 28
  const innerR = outerR * 0.52
  const rad = (deg: number) => (deg * Math.PI) / 180
  let acc = 0
  const segments = data.map((d, i) => {
    const pct = d.value / total
    const angleSpan = Math.max(pct * 360 - SEGMENT_GAP, 0.5)
    const startAngle = acc * 360 + SEGMENT_GAP / 2
    acc += pct
    const endAngle = acc * 360 - SEGMENT_GAP / 2
    const pullOut = hovered === i ? 8 : 0
    const oR = outerR + pullOut
    const iR = innerR + pullOut * 0.6
    const x1o = cx + oR * Math.cos(rad(startAngle - 90))
    const y1o = cy + oR * Math.sin(rad(startAngle - 90))
    const x2o = cx + oR * Math.cos(rad(endAngle - 90))
    const y2o = cy + oR * Math.sin(rad(endAngle - 90))
    const x1i = cx + iR * Math.cos(rad(startAngle - 90))
    const y1i = cy + iR * Math.sin(rad(startAngle - 90))
    const x2i = cx + iR * Math.cos(rad(endAngle - 90))
    const y2i = cy + iR * Math.sin(rad(endAngle - 90))
    const large = angleSpan > 180 ? 1 : 0
    const path = `M ${x1o} ${y1o} A ${oR} ${oR} 0 ${large} 1 ${x2o} ${y2o} L ${x2i} ${y2i} A ${iR} ${iR} 0 ${large} 0 ${x1i} ${y1i} Z`
    return {
      path,
      color: colors[i % colors.length],
      name: d.name,
      value: d.value,
      pct,
    }
  })

  const hoveredSeg = hovered !== null ? segments[hovered] : null

  return (
    <div className="campaign-asin-svg-chart">
      <div className="campaign-asin-chart-donut">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="campaign-asin-chart-svg">
          <defs>
            {segments.map((s, i) => (
              <linearGradient key={i} id={`pie-grad-${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={s.color} stopOpacity={1} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.82} />
              </linearGradient>
            ))}
          </defs>
          {segments.map((s, i) => (
            <path
              key={i}
              d={s.path}
              fill={`url(#pie-grad-${i})`}
              stroke="rgba(255,255,255,0.95)"
              strokeWidth={2}
              strokeLinejoin="round"
              className="campaign-asin-segment"
              style={{
                opacity: hovered === null || hovered === i ? 1 : 0.38,
                filter: hovered === i ? `drop-shadow(0 6px 16px ${s.color}50)` : undefined,
                transition: 'opacity 0.2s ease, filter 0.2s ease',
              }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            />
          ))}
        </svg>
        <div className="campaign-asin-chart-center">
          {hoveredSeg ? (
            <>
              <span className="campaign-asin-chart-total campaign-asin-chart-total--hover">
                {hoveredSeg.value.toLocaleString()}
              </span>
              <span className="campaign-asin-chart-label">
                {getLabel(hoveredSeg.name)}
              </span>
              <span className="campaign-asin-chart-pct">
                {(hoveredSeg.pct * 100).toFixed(1)}%
              </span>
            </>
          ) : (
            <>
              <span className="campaign-asin-chart-total">{total.toLocaleString()}</span>
              <span className="campaign-asin-chart-label">
                {metricName || 'Total'}
              </span>
            </>
          )}
        </div>
      </div>
      <ul className="campaign-asin-legend">
        {segments.map((s, i) => (
          <li
            key={i}
            className={`campaign-asin-legend-item ${hovered === i ? 'campaign-asin-legend-item--hovered' : ''}`}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="campaign-asin-legend-dot" style={{ background: s.color }} />
            <span className="campaign-asin-legend-text">
              <strong>{getLabel(s.name)}</strong>
              <span className="campaign-asin-legend-meta">
                {(s.pct * 100).toFixed(1)}% · {s.value.toLocaleString()}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function CampaignAsinSharePage() {
  const [csvText, setCsvText] = useState('')
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)

  const { headers, rows } = useMemo(() => {
    if (!csvText.trim()) return { headers: [] as string[], rows: [] }
    try {
      setParseError(null)
      return parseExactCsvWithAsin(csvText)
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Failed to parse CSV')
      return { headers: [] as string[], rows: [] }
    }
  }, [csvText])

  const aggregates = useMemo(() => {
    if (rows.length === 0 || headers.length === 0) return []
    return aggregateByAsin(rows, headers)
  }, [rows, headers])

  const metricOptions = useMemo(() => getNumericMetricHeaders(headers), [headers])

  const [selectedAsin, setSelectedAsin] = useState<string | ''>('')
  const [selectedMetric, setSelectedMetric] = useState<string>('')

  useEffect(() => {
    if (metricOptions.length > 0 && !metricOptions.includes(selectedMetric)) {
      setSelectedMetric(metricOptions[0])
    }
  }, [metricOptions, selectedMetric])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      setCsvText(String(reader.result ?? ''))
      setFileName(file.name)
      setSelectedAsin('')
    }
    reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }, [])

  const selectedAggregate = useMemo((): AsinAggregate | null => {
    if (!selectedAsin || aggregates.length === 0) return null
    return aggregates.find((a) => a.asin === selectedAsin) ?? null
  }, [selectedAsin, aggregates])

  const pieData = useMemo(() => {
    if (!selectedMetric || aggregates.length === 0) return []
    return aggregates
      .map((a) => ({
        name: a.asin,
        value: a.metrics[selectedMetric] ?? 0,
      }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [aggregates, selectedMetric])

  const hasData = aggregates.length > 0

  return (
    <div className="campaign-asin-share-tab">
      <section className="panel campaign-asin-upload">
        <h3>Reference Exact CSV</h3>
        <p className="panel-desc">
          Upload the same Exact campaign spreadsheet used under Auto → Exact. Campaign titles should follow{' '}
          <code>(INTENT) I keyword I EXACT I SP I ASIN</code>. The app will extract ASINs and show distribution by metric.
        </p>
        <div className="campaign-asin-upload-zone">
          <input
            type="file"
            accept=".csv,.txt"
            onChange={handleFileChange}
            className="campaign-asin-file-input"
          />
          {fileName && (
            <p className="campaign-asin-file-name">
              <strong>{fileName}</strong> — {rows.length} rows with ASINs, {aggregates.length} unique ASINs
            </p>
          )}
          {parseError && <p className="auto-exact-error">{parseError}</p>}
        </div>
      </section>

      {hasData && (
        <>
          <section className="panel campaign-asin-select">
            <h3>Select ASIN</h3>
            <p className="panel-desc">
              Choose an ASIN to view its details and pie chart distribution.
            </p>
            <div className="campaign-asin-controls">
              <div className="campaign-asin-field">
                <label htmlFor="asin-select">ASIN</label>
                <select
                  id="asin-select"
                  value={selectedAsin}
                  onChange={(e) => setSelectedAsin(e.target.value)}
                  className="campaign-asin-select-input"
                >
                  <option value="">— Select ASIN —</option>
                  {aggregates.map((a) => (
                    <option key={a.asin} value={a.asin}>
                      {getAsinDisplayLabel(a.asin)} ({a.rowCount} rows)
                    </option>
                  ))}
                </select>
              </div>
              <div className="campaign-asin-field">
                <label htmlFor="metric-select">Metric for pie chart</label>
                <select
                  id="metric-select"
                  value={selectedMetric || (metricOptions[0] ?? '')}
                  onChange={(e) => setSelectedMetric(e.target.value)}
                  className="campaign-asin-select-input"
                >
                  {metricOptions.length === 0 && (
                    <option value="">No numeric columns found</option>
                  )}
                  {metricOptions.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {selectedAggregate && (
            <section className="panel campaign-asin-details">
              <h3>{getAsinDisplayLabel(selectedAggregate.asin)}</h3>
              <div className="campaign-asin-metrics-grid">
                {headers.map((h) => {
                  const metricVal = selectedAggregate.metrics[h]
                  const rawVal = selectedAggregate.rawRows[0]?.raw[h]
                  const val = metricVal !== undefined ? metricVal : rawVal ?? '—'
                  const isNum = typeof val === 'number' || (typeof val === 'string' && val !== '—' && !isNaN(parseFloat(String(val))))
                  return (
                    <div key={h} className="campaign-asin-metric-item">
                      <span className="campaign-asin-metric-label">{h}</span>
                      <span className="campaign-asin-metric-value">
                        {isNum ? Number(val).toLocaleString(undefined, { maximumFractionDigits: 2 }) : val}
                      </span>
                    </div>
                  )
                })}
              </div>
              <p className="campaign-asin-row-count">
                {selectedAggregate.rowCount} row(s) for this ASIN
              </p>
            </section>
          )}

          <section className="panel campaign-asin-chart">
            <h3>Pie Chart: {selectedMetric || 'Select metric'}</h3>
            <p className="panel-desc">
              Distribution of {selectedMetric || 'metric'} across ASINs.
            </p>
            {pieData.length > 0 ? (
              <div className="campaign-asin-chart-wrap">
                <SvgPieChart data={pieData} colors={CHART_COLORS} getLabel={getAsinShortLabel} metricName={selectedMetric} />
              </div>
            ) : (
              <p className="muted">
                No data for &quot;{selectedMetric}&quot; or all values are zero. Try another metric.
              </p>
            )}
          </section>
        </>
      )}

      {!hasData && csvText && (
        <p className="muted">No rows with valid ASINs found. Ensure campaign titles follow (INTENT) I keyword I EXACT I SP I ASIN.</p>
      )}
    </div>
  )
}
