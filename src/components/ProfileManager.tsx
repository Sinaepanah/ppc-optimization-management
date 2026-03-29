import { useState, useCallback } from 'react'
import type { TopicProfile, Topic } from '../types'
import type { PresetId } from '../data/preset'
import { PRESET_OPTIONS } from '../data/preset'
import { TopicList, createEmptyTopic } from './TopicEditor'
import {
  updateTopicInProfile,
  removeTopicFromProfile,
  addTopicToProfile,
} from '../hooks/useTopicProfiles'

interface ProfileManagerProps {
  profiles: TopicProfile[]
  activeProfile: TopicProfile | null
  activeId: string | null
  onSelectProfile: (id: string | null) => void
  onUpdateProfile: (id: string, updates: Partial<TopicProfile>) => void
  onAddProfile: (name: string) => void
  onDeleteProfile: (id: string) => void
  onLoadPreset: (presetId: PresetId) => void
  onSaveProfile: () => void
}

export function ProfileManager({
  profiles,
  activeProfile,
  activeId,
  onSelectProfile,
  onUpdateProfile,
  onAddProfile,
  onDeleteProfile,
  onLoadPreset,
  onSaveProfile,
}: ProfileManagerProps) {
  const [newProfileName, setNewProfileName] = useState('')
  const [saveFeedback, setSaveFeedback] = useState(false)

  const handleSaveProfile = useCallback(() => {
    ;(document.activeElement as HTMLElement)?.blur()
    setTimeout(() => {
      onSaveProfile()
      setSaveFeedback(true)
      setTimeout(() => setSaveFeedback(false), 2500)
    }, 80)
  }, [onSaveProfile])

  const handleAddProfile = () => {
    const name = newProfileName.trim() || 'New profile'
    onAddProfile(name)
    setNewProfileName('')
  }

  const handleUpdateAllowed = (index: number, topic: Topic) => {
    if (!activeProfile) return
    const updated = updateTopicInProfile(activeProfile, 'allowedTopics', index, topic)
    onUpdateProfile(activeProfile.id, updated)
  }

  const handleRemoveAllowed = (index: number) => {
    if (!activeProfile) return
    const updated = removeTopicFromProfile(activeProfile, 'allowedTopics', index)
    onUpdateProfile(activeProfile.id, updated)
  }

  const handleAddAllowed = () => {
    if (!activeProfile) return
    const updated = addTopicToProfile(activeProfile, 'allowedTopics', createEmptyTopic())
    onUpdateProfile(activeProfile.id, updated)
  }

  const handleUpdateExcluded = (index: number, topic: Topic) => {
    if (!activeProfile) return
    const updated = updateTopicInProfile(activeProfile, 'excludedTopics', index, topic)
    onUpdateProfile(activeProfile.id, updated)
  }

  const handleRemoveExcluded = (index: number) => {
    if (!activeProfile) return
    const updated = removeTopicFromProfile(activeProfile, 'excludedTopics', index)
    onUpdateProfile(activeProfile.id, updated)
  }

  const handleAddExcluded = () => {
    if (!activeProfile) return
    const updated = addTopicToProfile(activeProfile, 'excludedTopics', createEmptyTopic())
    onUpdateProfile(activeProfile.id, updated)
  }

  const handleMinAllowedChange = (value: number) => {
    if (!activeProfile) return
    onUpdateProfile(activeProfile.id, { minimumAllowedMatches: value })
  }

  const [selectedPresetId, setSelectedPresetId] = useState<PresetId>('drinking-water')

  const handleLoadPreset = () => {
    onLoadPreset(selectedPresetId)
  }

  return (
    <form
      className="profile-manager profile-manager--unified"
      onSubmit={(e) => e.preventDefault()}
      aria-label="Topic profile settings"
    >
      <p className="panel-desc profile-manager__intro">
        Define allowed and excluded topics for relevancy filtering. Each topic has include phrases (word-boundary match) and optional exclude phrases.
        Start from a preset or create an empty profile. Any profile can be edited after loading.
      </p>

      <div className="profile-manager__unified-grid">
        <div className="profile-manager__toolbar profile-manager__toolbar--inline">
          <div className="profile-manager__preset">
            <label htmlFor="preset-select">Load preset</label>
            <select
              id="preset-select"
              value={selectedPresetId}
              onChange={(e) => setSelectedPresetId(e.target.value as PresetId)}
            >
              {PRESET_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
            <button type="button" className="btn btn--primary" onClick={handleLoadPreset}>
              Load
            </button>
          </div>
          <div className="profile-manager__new">
            <input
              type="text"
              value={newProfileName}
              onChange={(e) => setNewProfileName(e.target.value)}
              placeholder="New profile name"
              aria-label="New profile name"
            />
            <button type="button" className="btn btn--primary" onClick={handleAddProfile}>
              Create
            </button>
          </div>
        </div>

        <div className="profile-manager__select profile-manager__select--inline">
          <label>
            Active profile
            <select
              value={activeId ?? ''}
              onChange={(e) => onSelectProfile(e.target.value || null)}
            >
              <option value="">— Select profile —</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          {activeProfile && (
            <>
              <button
                type="button"
                className="btn btn--success"
                onClick={handleSaveProfile}
              >
                Save profile
              </button>
              {saveFeedback && <span className="profile-manager__saved">Saved!</span>}
              <button
                type="button"
                className="btn btn--small btn--danger"
                onClick={() => onDeleteProfile(activeProfile.id)}
                aria-label={`Delete profile ${activeProfile.name}`}
              >
                Delete
              </button>
            </>
          )}
        </div>

        {activeProfile && (
          <div className="profile-manager__min profile-manager__min--inline">
            <label>
              Minimum allowed topic matches
              <input
                type="number"
                min={1}
                max={10}
                value={activeProfile.minimumAllowedMatches}
                onChange={(e) => handleMinAllowedChange(Math.max(1, parseInt(e.target.value, 10) || 1))}
              />
            </label>
          </div>
        )}
      </div>

      {activeProfile && (
        <>
          <details className="profile-manager__topics-accordion">
            <summary className="profile-manager__topics-summary">Allowed topics</summary>
            <div className="profile-manager__topics-body">
              <TopicList
                topics={activeProfile.allowedTopics}
                group="allowed"
                onUpdate={handleUpdateAllowed}
                onRemove={handleRemoveAllowed}
                onAdd={handleAddAllowed}
                title=""
                showHeading={false}
              />
            </div>
          </details>
          <details className="profile-manager__topics-accordion">
            <summary className="profile-manager__topics-summary">Excluded topics</summary>
            <div className="profile-manager__topics-body">
              <TopicList
                topics={activeProfile.excludedTopics}
                group="excluded"
                onUpdate={handleUpdateExcluded}
                onRemove={handleRemoveExcluded}
                onAdd={handleAddExcluded}
                title=""
                showHeading={false}
              />
            </div>
          </details>
        </>
      )}
    </form>
  )
}
