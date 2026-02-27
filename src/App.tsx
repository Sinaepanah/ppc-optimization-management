import { useState, useEffect } from 'react'
import type { Campaign } from './types'
import { loadCampaigns, loadCampaignsAsync, saveCampaignsAsync } from './utils/storage'
import { CampaignInput } from './components/CampaignInput'
import { DeduplicationPanel } from './components/DeduplicationPanel'
import { RelevancyFilterPanel } from './components/RelevancyFilterPanel'
import { ProfileManager } from './components/ProfileManager'
import { AutoExactPage } from './autoExact/AutoExactPage'
import { PpcToolPage } from './ppcTool/PpcToolPage'
import { useTopicProfiles } from './hooks/useTopicProfiles'
import './App.css'

type TabId = 'campaigns' | 'dedup' | 'relevancy' | 'autoExact' | 'ppcTool'

export default function App() {
  const [campaigns, setCampaigns] = useState<Campaign[]>(() => loadCampaigns())
  const [tab, setTab] = useState<TabId>('campaigns')

  const {
    profiles,
    activeProfile,
    activeId,
    setActive,
    addProfile,
    updateProfile,
    deleteProfile,
    loadPreset,
    saveProfileNow,
  } = useTopicProfiles()

  useEffect(() => {
    saveCampaignsAsync(campaigns)
  }, [campaigns])

  useEffect(() => {
    let cancelled = false
    loadCampaignsAsync().then((data) => {
      if (!cancelled && data != null) setCampaigns(data)
    })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-header__title">Amazon PPC Manager</h1>
        <p className="app-tagline">Keyword deduplication & relevancy filtering — runs locally, no data sent to servers</p>
      </header>

      <nav className="tabs" role="navigation" aria-label="Main sections">
        <button
          type="button"
          className={`tabs__btn ${tab === 'campaigns' ? 'tabs__btn--active' : ''}`}
          onClick={() => setTab('campaigns')}
          aria-pressed={tab === 'campaigns'}
        >
          Campaign Input
        </button>
        <button
          type="button"
          className={`tabs__btn ${tab === 'dedup' ? 'tabs__btn--active' : ''}`}
          onClick={() => setTab('dedup')}
          aria-pressed={tab === 'dedup'}
        >
          Deduplication
        </button>
        <button
          type="button"
          className={`tabs__btn ${tab === 'relevancy' ? 'tabs__btn--active' : ''}`}
          onClick={() => setTab('relevancy')}
          aria-pressed={tab === 'relevancy'}
        >
          Relevancy Filter
        </button>
        <button
          type="button"
          className={`tabs__btn ${tab === 'autoExact' ? 'tabs__btn--active' : ''}`}
          onClick={() => setTab('autoExact')}
          aria-pressed={tab === 'autoExact'}
        >
          Auto → Exact
        </button>
        <button
          type="button"
          className={`tabs__btn ${tab === 'ppcTool' ? 'tabs__btn--active' : ''}`}
          onClick={() => setTab('ppcTool')}
          aria-pressed={tab === 'ppcTool'}
        >
          PPC Tool
        </button>
      </nav>

      <main className="main" role="main">
        {tab === 'campaigns' && (
          <CampaignInput campaigns={campaigns} onCampaignsChange={setCampaigns} />
        )}
        {tab === 'dedup' && <DeduplicationPanel campaigns={campaigns} />}
        {tab === 'relevancy' && (
          <div className="relevancy-tab">
            <RelevancyFilterPanel
              campaigns={campaigns}
              profile={activeProfile}
            />
            <ProfileManager
              profiles={profiles}
              activeProfile={activeProfile}
              activeId={activeId}
              onSelectProfile={setActive}
              onUpdateProfile={updateProfile}
              onAddProfile={addProfile}
              onDeleteProfile={deleteProfile}
              onLoadPreset={loadPreset}
              onSaveProfile={saveProfileNow}
            />
          </div>
        )}
        {tab === 'autoExact' && <AutoExactPage profiles={profiles} />}
        {tab === 'ppcTool' && <PpcToolPage />}
      </main>
    </div>
  )
}
