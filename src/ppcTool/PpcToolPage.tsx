import { useState, useRef, useEffect, useCallback } from 'react'
import { ImageUploadAnalyzer } from './ImageUploadAnalyzer'
import { PlacementImageAnalyzer } from './PlacementImageAnalyzer'
import { AdLevelCsvUpload } from './AdLevelCsvUpload'
import { PlacementCsvUpload } from './PlacementCsvUpload'
import { AdLevelDataForm } from './AdLevelDataForm'
import { PlacementDataTable } from './PlacementDataTable'
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

    let file: File | null = null
    const items = e.clipboardData?.items
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item?.type?.startsWith('image/')) {
          file = item.getAsFile()
          if (file) break
        }
      }
    }
    if (!file) {
      const fromFiles = e.clipboardData?.files?.[0]
      if (fromFiles?.type.startsWith('image/')) file = fromFiles
    }
    if (!file) return

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
        <div className="ppc-upload-row">
          <div className="ppc-upload-option">
            <ImageUploadAnalyzer
              isSelected={pasteTarget === 'adLevel'}
              onSelect={() => setPasteTarget('adLevel')}
              runOcrRef={adLevelRunOcrRef}
              onDataChange={setAdLevelData}
            />
          </div>
          <span className="ppc-upload-divider ppc-upload-divider--vertical">or</span>
          <div className="ppc-upload-option">
            <AdLevelCsvUpload onDataChange={setAdLevelData} />
          </div>
        </div>
        {Object.values(adLevelData || {}).some((v) => v != null && String(v).trim() !== '') && (
          <AdLevelDataForm values={adLevelData} onDataChange={setAdLevelData} />
        )}
      </div>

      <div className="panel ppc-placement-panel">
        <h2>Placement-Level PPC Data Extractor</h2>
        <p className="ppc-tool-desc">
          Click the upload box to select it for paste (Ctrl+V). Upload a screenshot of the placement table (4×11).
          Extracts data for Top of search, Rest of search, and Product pages.
        </p>
        <div className="ppc-upload-row">
          <div className="ppc-upload-option">
            <PlacementImageAnalyzer
              isSelected={pasteTarget === 'placement'}
              onSelect={() => setPasteTarget('placement')}
              runOcrRef={placementRunOcrRef}
              onDataChange={setPlacementData}
            />
          </div>
          <span className="ppc-upload-divider ppc-upload-divider--vertical">or</span>
          <div className="ppc-upload-option">
            <PlacementCsvUpload onDataChange={setPlacementData} />
          </div>
        </div>
        {placementData && (
          <PlacementDataTable data={placementData} onDataChange={setPlacementData} />
        )}
      </div>

      <div className="panel ppc-optimization-panel-wrap">
        <OptimizationPanel adLevelData={adLevelData} placementData={placementData} />
      </div>
    </div>
  )
}
