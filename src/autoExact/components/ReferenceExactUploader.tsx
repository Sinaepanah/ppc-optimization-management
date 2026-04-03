import { useCallback, useRef } from 'react'
import { parseReferenceExactCsvWithMetrics, type ReferenceExactResult } from '../utils/referenceExact'

interface ReferenceExactUploaderProps {
  onDataLoaded: (data: ReferenceExactResult) => void
  /** Rows parsed from CSV (one per campaign line) */
  campaignRowCount: number
  /** Distinct keyword + ASIN targets (one per product) */
  uniqueKeywordCount: number
}

export function ReferenceExactUploader({
  onDataLoaded,
  campaignRowCount,
  uniqueKeywordCount,
}: ReferenceExactUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const text = String(reader.result ?? '')
        const result = parseReferenceExactCsvWithMetrics(text)
        onDataLoaded(result)
      }
      reader.readAsText(file, 'UTF-8')
      e.target.value = ''
    },
    [onDataLoaded]
  )

  return (
    <section className="panel auto-exact-reference auto-exact-reference--compact">
      <h2 className="auto-exact-reference-heading">Reference Exact CSV</h2>
      <div className="auto-exact-reference-upload">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt"
          onChange={handleFileChange}
          className="auto-exact-reference-file"
        />
        {campaignRowCount > 0 && (
          <p className="auto-exact-reference-count muted">
            {campaignRowCount} campaign{campaignRowCount === 1 ? '' : 's'} · {uniqueKeywordCount} keyword–ASIN pair
            {uniqueKeywordCount === 1 ? '' : 's'}
            {uniqueKeywordCount < campaignRowCount && (
              <span className="auto-exact-reference-dup-hint"> (duplicate CSV rows merged)</span>
            )}
          </p>
        )}
      </div>
    </section>
  )
}
