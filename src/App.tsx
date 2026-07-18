import { useState, useEffect } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  LayoutList,
  TrendingUp,
  FileInput,
  Copy,
  Filter,
  ArrowRight,
  SlidersHorizontal,
  BarChart3,
  Search,
  Layers,
} from 'lucide-react'
import type { Campaign } from './types'
import { loadCampaigns, loadCampaignsAsync, saveCampaignsAsync } from './utils/storage'
import { CampaignInput } from './components/CampaignInput'
import { DeduplicationPanel } from './components/DeduplicationPanel'
import { RelevancyFilterPanel } from './components/RelevancyFilterPanel'
import { ProfileManager } from './components/ProfileManager'
import { AutoExactPage } from './autoExact/AutoExactPage'
import { PpcToolPage } from './ppcTool/PpcToolPage'
import { BulkPpcPage } from './bulkPpc/BulkPpcPage'
import { CampaignAsinSharePage } from './campaignAsinShare/CampaignAsinSharePage'
import { SQPPage } from './features/sqp/SQPPage'
import { useTopicProfiles } from './hooks/useTopicProfiles'
import './App.css'

type TabId = 'campaigns' | 'dedup' | 'relevancy' | 'autoExact' | 'ppcTool' | 'bulkPpc' | 'campaignAsinShare' | 'sqp'
type TabGroup = 'campaign' | 'ppc'

const CAMPAIGN_TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'campaigns', label: 'Campaign Input', icon: FileInput },
  { id: 'dedup', label: 'Deduplication', icon: Copy },
  { id: 'relevancy', label: 'Relevancy Filter', icon: Filter },
]

const PPC_TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'ppcTool', label: 'Exact Bid Tools', icon: SlidersHorizontal },
  { id: 'bulkPpc', label: 'Bulk PPC Optimizer', icon: Layers },
  { id: 'campaignAsinShare', label: 'ASIN Analytics', icon: BarChart3 },
  { id: 'sqp', label: 'SQP', icon: Search },
  { id: 'autoExact', label: 'Auto → Exact', icon: ArrowRight },
]

function getGroupForTab(tab: TabId): TabGroup {
  if (CAMPAIGN_TABS.some((t) => t.id === tab)) return 'campaign'
  return 'ppc'
}

export default function App() {
  const [campaigns, setCampaigns] = useState<Campaign[]>(() => loadCampaigns())
  const [tab, setTab] = useState<TabId>('campaigns')
  const [navForceCollapsed, setNavForceCollapsed] = useState(false)
  const group: TabGroup = getGroupForTab(tab)

  const selectTab = (id: TabId) => {
    setTab(id)
    setNavForceCollapsed(true)
    ;(document.activeElement as HTMLElement | null)?.blur()
  }

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

      <nav
        className={['tab-groups', navForceCollapsed ? 'tab-groups--force-collapsed' : ''].filter(Boolean).join(' ')}
        role="navigation"
        aria-label="Main sections"
        onMouseLeave={() => setNavForceCollapsed(false)}
      >
        <div className="tab-groups__primary">
          <button
            type="button"
            className={`tab-groups__primary-btn ${group === 'campaign' ? 'tab-groups__primary-btn--active' : ''}`}
            onClick={() => selectTab('campaigns')}
            aria-pressed={group === 'campaign'}
          >
            <LayoutList className="tab-groups__primary-icon" aria-hidden />
            <span>Campaign Tools</span>
          </button>
          <button
            type="button"
            className={`tab-groups__primary-btn ${group === 'ppc' ? 'tab-groups__primary-btn--active' : ''}`}
            onClick={() => selectTab('ppcTool')}
            aria-pressed={group === 'ppc'}
          >
            <TrendingUp className="tab-groups__primary-icon" aria-hidden />
            <span>PPC Tools</span>
          </button>
        </div>
        <div className="tab-groups__secondary">
          {group === 'campaign' &&
            CAMPAIGN_TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={`tab-groups__secondary-btn ${tab === id ? 'tab-groups__secondary-btn--active' : ''}`}
                onClick={() => selectTab(id)}
                aria-pressed={tab === id}
              >
                <Icon className="tab-groups__secondary-icon" aria-hidden />
                <span>{label}</span>
              </button>
            ))}
          {group === 'ppc' &&
            PPC_TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={`tab-groups__secondary-btn ${tab === id ? 'tab-groups__secondary-btn--active' : ''}`}
                onClick={() => selectTab(id)}
                aria-pressed={tab === id}
              >
                <Icon className="tab-groups__secondary-icon" aria-hidden />
                <span>{label}</span>
              </button>
            ))}
        </div>
      </nav>

      <main className="main" role="main">
        {tab === 'campaigns' && (
          <CampaignInput campaigns={campaigns} onCampaignsChange={setCampaigns} />
        )}
        {tab === 'dedup' && <DeduplicationPanel campaigns={campaigns} />}
        {tab === 'relevancy' && (
          <div className="relevancy-tab">
            <div className="relevancy-tab__main">
              <RelevancyFilterPanel
                campaigns={campaigns}
                profile={activeProfile}
              />
            </div>
            <div className="relevancy-tab__profiles-section">
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
          </div>
        )}
        {tab === 'autoExact' && <AutoExactPage profiles={profiles} campaigns={campaigns} />}
        {tab === 'ppcTool' && <PpcToolPage />}
        {tab === 'bulkPpc' && <BulkPpcPage />}
        {tab === 'campaignAsinShare' && <CampaignAsinSharePage />}
        {tab === 'sqp' && <SQPPage />}
      </main>
    </div>
  )
}
