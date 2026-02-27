import { useState, useRef, useEffect, useCallback } from 'react'
import { ImageUploadAnalyzer } from './ImageUploadAnalyzer'
import { PlacementImageAnalyzer } from './PlacementImageAnalyzer'
import { OptimizationPanel } from './OptimizationPanel'
import type { ExtractedPlacementData } from './utils/placementParser'

export type PasteTarget = 'adLevel' | 'placement' | null

export function PpcToolPage() {
  const [pasteTarget, setPasteTarget] = useState<PasteTarget>(null)
  const [adLevelData, setAdLevelData] = useState<Record<string, string>>({})
  const [placementData, setPlacementData] = useState<ExtractedPlacementData | null>(null)
  const adLevelRunOcrRef = useRef<((file: File) => void) | null>(null)
  const placementRunOcrRef = useRef<((file: File) => void) | null>(null)

  const handlePaste = useCallback((e: ClipboardEvent) => {
    if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return
    const file = e.clipboardData?.files[0]
    if (!file?.type.startsWith('image/')) return
    e.preventDefault()
    if (pasteTarget === 'adLevel' && adLevelRunOcrRef.current) {
      adLevelRunOcrRef.current(file)
    } else if (pasteTarget === 'placement' && placementRunOcrRef.current) {
      placementRunOcrRef.current(file)
    }
  }, [pasteTarget])

  useEffect(() => {
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [handlePaste])

  return (
    <div className="ppc-tool">
      <div className="panel">
        <h2>Ad-Level PPC Data Extractor</h2>
        <p className="ppc-tool-desc">
          Click the upload box to select it for paste (Ctrl+V). Upload a screenshot of Amazon Campaign Manager
          ad-level metrics. The tool extracts Bid, Impressions, Clicks, Total Cost, CPC, Purchases, Sales, and ACOS.
        </p>
        <ImageUploadAnalyzer
          isSelected={pasteTarget === 'adLevel'}
          onSelect={() => setPasteTarget('adLevel')}
          runOcrRef={adLevelRunOcrRef}
          onDataChange={setAdLevelData}
        />
      </div>

      <div className="panel ppc-placement-panel">
        <h2>Placement-Level PPC Data Extractor</h2>
        <p className="ppc-tool-desc">
          Click the upload box to select it for paste (Ctrl+V). Upload a screenshot of the placement table (4×11).
          Extracts data for Top of search, Rest of search, and Product pages.
        </p>
        <PlacementImageAnalyzer
          isSelected={pasteTarget === 'placement'}
          onSelect={() => setPasteTarget('placement')}
          runOcrRef={placementRunOcrRef}
          onDataChange={setPlacementData}
        />
      </div>

      <div className="panel ppc-optimization-panel-wrap">
        <OptimizationPanel adLevelData={adLevelData} placementData={placementData} />
      </div>
    </div>
  )
}
