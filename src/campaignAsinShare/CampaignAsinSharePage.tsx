import { useCallback, useMemo, useState } from 'react'
import {
  parseExactCsvWithAsin,
  aggregateByAsin,
  formatMetricValue,
  type AsinAggregate,
} from './utils/asinShare'
import { readEncodedTextFile, TABULAR_UPLOAD_ACCEPT } from '../utils/readEncodedTextFile'

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

const SEGMENT_GAP = 1.5

const PERFORMANCE_TIER_COLORS = {
  high: '#16a34a', // green
  medium: '#facc15', // yellow
  low: '#dc2626', // red
}

function getTierColor(index: number, length: number): string {
  if (length <= 1) return PERFORMANCE_TIER_COLORS.high
  if (length === 2) return index === 0 ? PERFORMANCE_TIER_COLORS.high : PERFORMANCE_TIER_COLORS.low
  if (index === 0) return PERFORMANCE_TIER_COLORS.high
  if (index === length - 1) return PERFORMANCE_TIER_COLORS.low
  return PERFORMANCE_TIER_COLORS.medium
}

type KpiKey =
  | 'campaignBudget'
  | 'combinedPerformance'
  | 'impressions'
  | 'clicks'
  | 'totalCost'
  | 'cpc'
  | 'purchases'
  | 'sales'
  | 'acos'
  | 'roas'

interface KpiOption {
  key: KpiKey
  label: string
}

const KPI_OPTIONS: KpiOption[] = [
  { key: 'campaignBudget', label: 'Campaign budget amount' },
  { key: 'combinedPerformance', label: 'Combined Performance KPI' },
  { key: 'acos', label: 'ACOS' },
  { key: 'roas', label: 'ROAS' },
]

const DETAIL_KPIS: KpiKey[] = [
  'campaignBudget',
  'sales',
  'acos',
  'roas',
]

function findHeader(headers: string[], matcher: (h: string) => boolean): string | null {
  const converted = headers.find((h) => /\(converted\)/i.test(h) && matcher(h))
  if (converted) return converted
  return headers.find(matcher) ?? null
}

function resolveKpiHeader(key: KpiKey, headers: string[]): string | null {
  switch (key) {
    case 'campaignBudget':
      return (
        findHeader(headers, (h) => /^campaign budget amount(\s*\(converted\))?$/i.test(h.trim())) ??
        findHeader(headers, (h) => /campaign budget amount/i.test(h))
      )
    case 'combinedPerformance':
      return null
    case 'impressions':
      return findHeader(headers, (h) => /^impressions?$/i.test(h.trim()) || /impressions?/i.test(h))
    case 'clicks':
      return findHeader(headers, (h) => /^clicks?$/i.test(h.trim()) || /\bclicks?\b/i.test(h))
    case 'totalCost':
      return (
        findHeader(headers, (h) => /^total cost(\s*\(converted\))?$/i.test(h.trim())) ??
        findHeader(headers, (h) => /\btotal cost\b|\bcost\b|\bspend\b/i.test(h))
      )
    case 'cpc':
      return findHeader(headers, (h) => /^cpc(\s*\(converted\))?$/i.test(h.trim()) || /\bcpc\b|cost per click/i.test(h))
    case 'purchases':
      return findHeader(headers, (h) => /\bpurchases?\b|\borders?\b|\bunits?\s*ordered\b/i.test(h))
    case 'sales':
      return (
        findHeader(headers, (h) => /^sales(\s*\(converted\))?$/i.test(h.trim())) ??
        findHeader(headers, (h) => /\bsales?\b/i.test(h))
      )
    case 'acos':
      return findHeader(headers, (h) => /\bacos\b|advertising cost of sales/i.test(h))
    case 'roas':
      return findHeader(headers, (h) => /\broas\b|return on ad spend/i.test(h))
    default:
      return null
  }
}

function isRateKpi(key: KpiKey): boolean {
  return key === 'cpc' || key === 'acos' || key === 'roas'
}

function formatKpiValue(key: KpiKey, value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (key === 'combinedPerformance') {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }
  if (key === 'campaignBudget' || key === 'totalCost' || key === 'sales') {
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }
  if (key === 'acos') {
    const pct = value <= 1.5 ? value * 100 : value
    return `${pct.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
  }
  if (key === 'cpc' || key === 'roas') {
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function parseMetricNumber(raw: string | undefined): number {
  if (raw == null) return 0
  const s = String(raw).trim()
  if (!s) return 0
  const cleaned = s.replace(/[$,%\s,]/g, '')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

function AsinRateBarChart({
  data,
  getLabel,
  metricKey,
}: {
  data: { name: string; value: number }[]
  getLabel: (asin: string) => string
  metricKey: 'acos' | 'roas'
}) {
  if (data.length === 0) return null
  const maxVal = Math.max(...data.map((d) => d.value), 0.0001)
  return (
    <div className="campaign-asin-acos-bars">
      {data.map((d, idx) => {
        const width = Math.max((d.value / maxVal) * 100, 6)
        const color = getTierColor(idx, data.length)
        return (
          <div key={d.name} className="campaign-asin-acos-row">
            <div className="campaign-asin-acos-label">{getLabel(d.name)}</div>
            <div className="campaign-asin-acos-track">
              <div
                className="campaign-asin-acos-fill"
                style={{
                  width: `${width}%`,
                  background: `linear-gradient(90deg, ${color}, ${color}cc)`,
                }}
              />
            </div>
            <div className="campaign-asin-acos-value">{formatKpiValue(metricKey, d.value)}</div>
          </div>
        )
      })}
    </div>
  )
}

/** Elegant donut chart with hover interactions and dynamic center display */
function SvgPieChart({
  data,
  size = 360,
  getLabel,
  metricName = '',
  metricHeader = '',
  chartId = 'chart',
  formatValue,
}: {
  data: { name: string; value: number }[]
  size?: number
  getLabel: (asin: string) => string
  metricName?: string
  metricHeader?: string
  chartId?: string
  formatValue?: (value: number, header: string) => string
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
    const midAngle = (startAngle + endAngle) / 2
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

    const labelR = outerR + 20 + pullOut
    const labelHalfSpan = Math.min(Math.max(angleSpan * 0.28, 12), 30)
    const labelStartAngle = midAngle - labelHalfSpan
    const labelEndAngle = midAngle + labelHalfSpan
    const lx1 = cx + labelR * Math.cos(rad(labelStartAngle - 90))
    const ly1 = cy + labelR * Math.sin(rad(labelStartAngle - 90))
    const lx2 = cx + labelR * Math.cos(rad(labelEndAngle - 90))
    const ly2 = cy + labelR * Math.sin(rad(labelEndAngle - 90))
    const labelLarge = Math.abs(labelEndAngle - labelStartAngle) > 180 ? 1 : 0
    // Keep text upright: if tangent points left at midpoint, reverse arc direction.
    const tangentX = -Math.sin(rad(midAngle - 90))
    const shouldReverseLabelPath = tangentX < 0
    const labelArcPath = shouldReverseLabelPath
      ? `M ${lx2} ${ly2} A ${labelR} ${labelR} 0 ${labelLarge} 0 ${lx1} ${ly1}`
      : `M ${lx1} ${ly1} A ${labelR} ${labelR} 0 ${labelLarge} 1 ${lx2} ${ly2}`

    return {
      path,
      color: getTierColor(i, data.length),
      name: d.name,
      value: d.value,
      pct,
      labelArcPath,
      angleSpan,
    }
  })

  const hoveredSeg = hovered !== null ? segments[hovered] : null
  const valueFormatter = formatValue ?? ((value: number, header: string) => formatMetricValue(header, value))

  return (
    <div className="campaign-asin-svg-chart">
      <div className="campaign-asin-chart-donut">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="campaign-asin-chart-svg">
          <defs>
            {segments.map((s, i) => (
              <linearGradient key={i} id={`${chartId}-pie-grad-${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={s.color} stopOpacity={1} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.82} />
              </linearGradient>
            ))}
          </defs>
          {segments.map((s, i) => (
            <path
              key={i}
              d={s.path}
              fill={`url(#${chartId}-pie-grad-${i})`}
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
          {segments.map((s, i) => (
            <path
              key={`label-arc-${i}`}
              id={`${chartId}-label-arc-${i}`}
              d={s.labelArcPath}
              fill="none"
              stroke="none"
            />
          ))}
          {segments.map((s, i) => (
            <text key={`label-text-${i}`} className="campaign-asin-chart-arc-label">
              <textPath href={`#${chartId}-label-arc-${i}`} startOffset="50%" textAnchor="middle">
                {getLabel(s.name)}
              </textPath>
            </text>
          ))}
        </svg>
        <div className="campaign-asin-chart-center">
          {hoveredSeg ? (
            <>
              <span className="campaign-asin-chart-total campaign-asin-chart-total--hover">
                {valueFormatter(hoveredSeg.value, metricHeader)}
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
              <span className="campaign-asin-chart-total">{valueFormatter(total, metricHeader)}</span>
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
                {(s.pct * 100).toFixed(1)}% · {valueFormatter(s.value, metricHeader)}
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

  const [selectedAsin, setSelectedAsin] = useState<string | ''>('')
  const [selectedMetric, setSelectedMetric] = useState<KpiKey>('campaignBudget')

  const kpiHeaders = useMemo(() => {
    return {
      campaignBudget: resolveKpiHeader('campaignBudget', headers),
      impressions: resolveKpiHeader('impressions', headers),
      clicks: resolveKpiHeader('clicks', headers),
      totalCost: resolveKpiHeader('totalCost', headers),
      cpc: resolveKpiHeader('cpc', headers),
      purchases: resolveKpiHeader('purchases', headers),
      sales: resolveKpiHeader('sales', headers),
      acos: resolveKpiHeader('acos', headers),
      roas: resolveKpiHeader('roas', headers),
    } as const
  }, [headers])

  const selectedMetricHeader = useMemo(() => {
    if (selectedMetric === 'combinedPerformance') return null
    return resolveKpiHeader(selectedMetric, headers)
  }, [selectedMetric, headers])

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const text = await readEncodedTextFile(file)
    setCsvText(text)
    setFileName(file.name)
    setSelectedAsin('')
    e.target.value = ''
  }, [])

  const selectedAggregate = useMemo((): AsinAggregate | null => {
    if (!selectedAsin || aggregates.length === 0) return null
    return aggregates.find((a) => a.asin === selectedAsin) ?? null
  }, [selectedAsin, aggregates])

  const pieData = useMemo(() => {
    if (!selectedMetricHeader || aggregates.length === 0) return []
    return aggregates
      .map((a) => ({
        name: a.asin,
        value: a.metrics[selectedMetricHeader] ?? 0,
      }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [aggregates, selectedMetricHeader])

  const avgPieData = useMemo(() => {
    if (!selectedMetricHeader || aggregates.length === 0) return []
    return aggregates
      .map((a) => ({
        name: a.asin,
        value:
          isRateKpi(selectedMetric)
            ? a.metrics[selectedMetricHeader] ?? 0
            : a.rowCount > 0
              ? (a.metrics[selectedMetricHeader] ?? 0) / a.rowCount
              : 0,
      }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [aggregates, selectedMetric, selectedMetricHeader])

  const distributionPieData = useMemo(() => {
    if (!selectedMetricHeader || aggregates.length === 0) return []
    const sums = aggregates
      .map((a) => ({ name: a.asin, value: a.metrics[selectedMetricHeader] ?? 0 }))
      .filter((d) => d.value > 0)
    const total = sums.reduce((acc, d) => acc + d.value, 0)
    if (total <= 0) return []
    return sums
      .map((d) => ({ name: d.name, value: (d.value / total) * 100 }))
      .sort((a, b) => b.value - a.value)
  }, [aggregates, selectedMetricHeader])

  const rateBarData = useMemo(() => {
    if ((selectedMetric !== 'acos' && selectedMetric !== 'roas') || !selectedMetricHeader) return []
    return aggregates
      .map((a) => ({
        name: a.asin,
        value: a.metrics[selectedMetricHeader] ?? 0,
      }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [aggregates, selectedMetric, selectedMetricHeader])

  function buildMetricSeries(
    key: 'impressions' | 'clicks' | 'totalCost' | 'cpc' | 'purchases' | 'sales',
    mode: 'sum' | 'average' | 'distribution'
  ): { name: string; value: number }[] {
    const header = kpiHeaders[key]
    if (!header || aggregates.length === 0) return []
    const base = aggregates
      .map((a) => ({ name: a.asin, value: a.metrics[header] ?? 0, rows: a.rowCount }))
      .filter((d) => d.value > 0)
    if (base.length === 0) return []
    if (mode === 'sum') return base.map(({ name, value }) => ({ name, value })).sort((a, b) => b.value - a.value)
    if (mode === 'average') {
      if (key === 'cpc') {
        return aggregates
          .map((a) => {
            let sum = 0
            let count = 0
            for (const row of a.rawRows) {
              const raw = row.raw[header]
              if (raw == null || String(raw).trim() === '') continue
              const value = parseMetricNumber(raw)
              if (value <= 0) continue
              sum += value
              count += 1
            }
            return { name: a.asin, value: count > 0 ? sum / count : 0 }
          })
          .filter((d) => d.value > 0)
          .sort((a, b) => b.value - a.value)
      }
      return aggregates
        .map((a) => {
          let nonZeroCount = 0
          for (const row of a.rawRows) {
            const raw = row.raw[header]
            if (raw == null || String(raw).trim() === '') continue
            const v = parseMetricNumber(raw)
            if (v > 0) nonZeroCount += 1
          }
          const totalValue = a.metrics[header] ?? 0
          return { name: a.asin, value: nonZeroCount > 0 ? totalValue / nonZeroCount : 0 }
        })
        .filter((d) => d.value > 0)
        .sort((a, b) => b.value - a.value)
    }
    const total = base.reduce((acc, d) => acc + d.value, 0)
    if (total <= 0) return []
    return base
      .map(({ name, value }) => ({ name, value: (value / total) * 100 }))
      .sort((a, b) => b.value - a.value)
  }

  const combinedPerformanceCharts = useMemo(
    () => [
      {
        id: 'comb-impr',
        title: 'Impressions (sum)',
        metricName: 'Impressions',
        data: buildMetricSeries('impressions', 'sum'),
        formatter: (v: number) => formatKpiValue('impressions', v),
      },
      {
        id: 'comb-clicks',
        title: 'Clicks (sum)',
        metricName: 'Clicks',
        data: buildMetricSeries('clicks', 'sum'),
        formatter: (v: number) => formatKpiValue('clicks', v),
      },
      {
        id: 'comb-cost',
        title: 'Total Cost (sum)',
        metricName: 'Total cost',
        data: buildMetricSeries('totalCost', 'sum'),
        formatter: (v: number) => formatKpiValue('totalCost', v),
      },
      {
        id: 'comb-cpc',
        title: 'CPC (average)',
        metricName: 'CPC',
        data: buildMetricSeries('cpc', 'average'),
        formatter: (v: number) => formatKpiValue('cpc', v),
      },
      {
        id: 'comb-purchases',
        title: 'Purchases share of total (%)',
        metricName: 'Purchases share',
        data: buildMetricSeries('purchases', 'distribution'),
        formatter: (v: number) => `${v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`,
      },
      {
        id: 'comb-sales',
        title: 'Sales share of total (%)',
        metricName: 'Sales share',
        data: buildMetricSeries('sales', 'distribution'),
        formatter: (v: number) => `${v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`,
      },
    ],
    [aggregates, kpiHeaders]
  )

  type ChartKind = 'average' | 'sum' | 'distribution' | 'rateBar'
  const visibleCharts = useMemo<ChartKind[]>(() => {
    switch (selectedMetric) {
      case 'purchases':
        return ['distribution']
      case 'sales':
        return ['distribution']
      case 'acos':
      case 'roas':
        return ['rateBar']
      default:
        return ['average', 'sum', 'distribution']
    }
  }, [selectedMetric])

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
            accept={TABULAR_UPLOAD_ACCEPT}
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
                <label htmlFor="metric-select">Metric for chart</label>
                <select
                  id="metric-select"
                  value={selectedMetric}
                  onChange={(e) => setSelectedMetric(e.target.value as KpiKey)}
                  className="campaign-asin-select-input"
                >
                  {KPI_OPTIONS.map((k) => (
                    <option key={k.key} value={k.key}>
                      {k.label}
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
                {DETAIL_KPIS.map((k) => {
                  const header = resolveKpiHeader(k, headers)
                  if (!header) return null
                  const metricVal = selectedAggregate.metrics[header]
                  if (metricVal == null) return null
                  return (
                    <div key={k} className="campaign-asin-metric-item">
                      <span className="campaign-asin-metric-label">{KPI_OPTIONS.find((x) => x.key === k)?.label ?? k}</span>
                      <span className="campaign-asin-metric-value">{formatKpiValue(k, metricVal)}</span>
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
            <h3>
              ASIN KPI Pies:{' '}
              {KPI_OPTIONS.find((k) => k.key === selectedMetric)?.label ?? 'Select metric'}
            </h3>
            <p className="panel-desc">
              KPI-specific view with relevant charts for the selected metric.
            </p>
            {selectedMetric === 'combinedPerformance' ? (
              <div className="campaign-asin-chart-grid campaign-asin-chart-grid--combined">
                {combinedPerformanceCharts.map((chart) => (
                  <div key={chart.id} className="campaign-asin-chart-card">
                    <h4 className="campaign-asin-chart-card-title">{chart.title}</h4>
                    <SvgPieChart
                      data={chart.data}
                      size={260}
                      getLabel={getAsinShortLabel}
                      metricName={chart.metricName}
                      metricHeader={chart.metricName}
                      chartId={chart.id}
                      formatValue={(v) => chart.formatter(v)}
                    />
                  </div>
                ))}
              </div>
            ) : selectedMetricHeader && (pieData.length > 0 || avgPieData.length > 0 || distributionPieData.length > 0 || rateBarData.length > 0) ? (
              <div className="campaign-asin-chart-grid">
                {visibleCharts.includes('average') && (
                  <div className="campaign-asin-chart-card">
                    <h4 className="campaign-asin-chart-card-title">Average</h4>
                    <SvgPieChart
                      data={avgPieData}
                      size={280}
                      getLabel={getAsinShortLabel}
                      metricName={`Average — ${KPI_OPTIONS.find((k) => k.key === selectedMetric)?.label ?? selectedMetric}`}
                      metricHeader={selectedMetricHeader}
                      chartId="asin-avg"
                      formatValue={(v) => formatKpiValue(selectedMetric, v)}
                    />
                  </div>
                )}
                {visibleCharts.includes('sum') && (
                  <div className="campaign-asin-chart-card">
                    <h4 className="campaign-asin-chart-card-title">Sum</h4>
                    <SvgPieChart
                      data={pieData}
                      size={280}
                      getLabel={getAsinShortLabel}
                      metricName={`Sum — ${KPI_OPTIONS.find((k) => k.key === selectedMetric)?.label ?? selectedMetric}`}
                      metricHeader={selectedMetricHeader}
                      chartId="asin-sum"
                      formatValue={(v) => formatKpiValue(selectedMetric, v)}
                    />
                  </div>
                )}
                {visibleCharts.includes('distribution') && (
                  <div className="campaign-asin-chart-card">
                    <h4 className="campaign-asin-chart-card-title">% Distribution of KPI</h4>
                    <SvgPieChart
                      data={distributionPieData}
                      size={280}
                      getLabel={getAsinShortLabel}
                      metricName={`% Distribution — ${KPI_OPTIONS.find((k) => k.key === selectedMetric)?.label ?? selectedMetric}`}
                      metricHeader="distribution"
                      chartId="asin-share"
                      formatValue={(v) => `${v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`}
                    />
                  </div>
                )}
                {visibleCharts.includes('rateBar') && (
                  <div className="campaign-asin-chart-card campaign-asin-chart-card--wide">
                    <h4 className="campaign-asin-chart-card-title">{selectedMetric === 'roas' ? 'ROAS by ASIN' : 'ACOS by ASIN'}</h4>
                    <AsinRateBarChart
                      data={rateBarData}
                      getLabel={getAsinShortLabel}
                      metricKey={selectedMetric === 'roas' ? 'roas' : 'acos'}
                    />
                  </div>
                )}
              </div>
            ) : (
              <p className="muted">
                No data for selected KPI in this file. Confirm the CSV has that metric column.
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
