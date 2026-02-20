import { useCallback, useRef } from 'react'
import { parseReferenceExactCsv } from '../utils/referenceExact'

interface ReferenceExactUploaderProps {
  onKeywordsLoaded: (keywords: Set<string>) => void
  loadedCount: number
}

export function ReferenceExactUploader({ onKeywordsLoaded, loadedCount }: ReferenceExactUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const text = String(reader.result ?? '')
        const set = parseReferenceExactCsv(text)
        onKeywordsLoaded(set)
      }
      reader.readAsText(file, 'UTF-8')
      e.target.value = ''
    },
    [onKeywordsLoaded]
  )

  return (
    <section className="panel auto-exact-reference">
      <h3>Reference Exact CSV</h3>
      <p className="panel-desc">
        Upload your Amazon campaign export CSV that contains <strong>active EXACT campaigns</strong>. Campaign titles
        should follow the format <code>(INTENT) I keyword I EXACT I SP I ASIN</code>. The app will extract the keyword
        from each title and exclude those from the Promote to Exact list when the filter is on.
      </p>
      <div className="auto-exact-reference-upload">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt"
          onChange={handleFileChange}
          className="auto-exact-reference-file"
        />
        {loadedCount > 0 && (
          <p className="auto-exact-reference-count">
            <strong>{loadedCount}</strong> exact keywords loaded from reference CSV.
          </p>
        )}
      </div>
    </section>
  )
}
