import { useCallback } from 'react'

export type FieldType = 'currency' | 'integer' | 'percent' | 'percentWhole'

function parseNum(s: string): number {
  return parseFloat(s.replace(/[$,%]/g, '')) || 0
}

function formatVal(n: number, type: FieldType): string {
  if (type === 'currency') return n.toFixed(2)
  if (type === 'integer') return Math.round(n).toString()
  if (type === 'percent') return n.toFixed(2)
  if (type === 'percentWhole') return Math.round(n).toString()
  return String(n)
}

function getStep(type: FieldType, delta: number): number {
  if (type === 'currency') return delta > 0 ? 0.01 : -0.01
  if (type === 'integer') return delta > 0 ? 1 : -1
  if (type === 'percent') return delta > 0 ? 0.01 : -0.01
  if (type === 'percentWhole') return delta > 0 ? 1 : -1
  return delta > 0 ? 1 : -1
}

interface NumberInputWithArrowsProps {
  value: string
  onChange: (value: string) => void
  type: FieldType
  prefix?: string
  suffix?: string
  placeholder?: string
  id?: string
  min?: number
  max?: number
}

export function NumberInputWithArrows({
  value,
  onChange,
  type,
  prefix,
  suffix,
  placeholder = '—',
  id,
  min,
  max,
}: NumberInputWithArrowsProps) {
  const adjust = useCallback(
    (delta: number) => {
      const n = parseNum(value)
      const step = getStep(type, delta)
      let next = n + step
      if (min != null) next = Math.max(min, next)
      if (max != null) next = Math.min(max, next)
      onChange(formatVal(next, type))
    },
    [value, onChange, type, min, max]
  )

  return (
    <div className="ppc-input-with-arrows">
      {prefix && <span className="ppc-prefix">{prefix}</span>}
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {suffix && <span className="ppc-suffix">{suffix}</span>}
      <div className="ppc-arrow-btns">
        <button type="button" className="ppc-arrow-btn" onClick={() => adjust(1)} aria-label="Increase">
          ▲
        </button>
        <button type="button" className="ppc-arrow-btn" onClick={() => adjust(-1)} aria-label="Decrease">
          ▼
        </button>
      </div>
    </div>
  )
}
