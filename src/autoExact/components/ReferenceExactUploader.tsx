import { useCallback, useRef } from 'react'
import { parseReferenceExactCsvWithMetrics, type ReferenceExactResult } from '../utils/referenceExact'
import { readEncodedTextFile, TABULAR_UPLOAD_ACCEPT } from '../../utils/readEncodedTextFile'

interface ReferenceExactUploaderProps {
  onDataLoaded: (data: ReferenceExactResult, fileName: string) => void
  onClear: () => void
  fileName?: string
  /** Rows parsed from CSV (one per campaign line) */
  campaignRowCount: number
  /** Distinct keyword + ASIN targets (one per product) */
  uniqueKeywordCount: number
  referenceFormat?: ReferenceExactResult['referenceFormat']
}

export function ReferenceExactUploader({
  onDataLoaded,
  onClear,
  fileName,
  campaignRowCount,
  uniqueKeywordCount,
  referenceFormat,
}: ReferenceExactUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const text = await readEncodedTextFile(file)
      const result = parseReferenceExactCsvWithMetrics(text)
      onDataLoaded(result, file.name)
      e.target.value = ''
    },
    [onDataLoaded]
  )

  const handleClear = useCallback(() => {
    onClear()
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [onClear])

  return (
    <section className="panel auto-exact-reference auto-exact-reference--compact">
      <h2 className="auto-exact-reference-heading">Reference Exact CSV</h2>
      <div className="auto-exact-reference-upload">
        <input
          ref={fileInputRef}
          type="file"
          accept={TABULAR_UPLOAD_ACCEPT}
          onChange={handleFileChange}
          className="auto-exact-reference-file"
        />
        {campaignRowCount > 0 && (
          <>
            {fileName && (
              <p className="auto-exact-reference-count muted">
                Loaded: <strong>{fileName}</strong>
              </p>
            )}
            <p className="auto-exact-reference-count muted">
            {referenceFormat === 'targeting-export' ? (
              <>
                {campaignRowCount} EXACT keyword{campaignRowCount === 1 ? '' : 's'} from targeting export
              </>
            ) : (
              <>
                {campaignRowCount} campaign{campaignRowCount === 1 ? '' : 's'} · {uniqueKeywordCount} keyword–ASIN pair
                {uniqueKeywordCount === 1 ? '' : 's'}
                {uniqueKeywordCount < campaignRowCount && (
                  <span className="auto-exact-reference-dup-hint"> (duplicate CSV rows merged)</span>
                )}
              </>
            )}
          </p>
            <button type="button" className="btn btn--secondary btn--small" onClick={handleClear}>
              Remove reference file
            </button>
          </>
        )}
      </div>
    </section>
  )
}
