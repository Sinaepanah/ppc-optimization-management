import { useState, useCallback, useEffect, useRef } from 'react'
import type { TopicProfile, Topic } from '../types'
import {
  loadProfiles,
  saveProfiles,
  loadActiveProfileId,
  saveActiveProfileId,
  loadProfilesAsync,
  loadActiveProfileIdAsync,
  saveProfilesAsync,
  saveActiveProfileIdAsync,
} from '../utils/storage'
import { PRESET_OPTIONS, type PresetId } from '../data/preset'

function generateProfileId(): string {
  return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function useTopicProfiles() {
  const [profiles, setProfiles] = useState<TopicProfile[]>(() => loadProfiles())
  const [activeId, setActiveId] = useState<string | null>(() => loadActiveProfileId())
  const profilesRef = useRef(profiles)
  const activeIdRef = useRef(activeId)
  profilesRef.current = profiles
  activeIdRef.current = activeId

  useEffect(() => {
    saveProfilesAsync(profiles)
  }, [profiles])

  useEffect(() => {
    saveActiveProfileIdAsync(activeId)
  }, [activeId])

  useEffect(() => {
    let cancelled = false
    Promise.all([loadProfilesAsync(), loadActiveProfileIdAsync()]).then(([profilesData, activeIdData]) => {
      if (cancelled) return
      if (profilesData != null) setProfiles(profilesData)
      if (activeIdData !== undefined) setActiveId(activeIdData)
    })
    return () => { cancelled = true }
  }, [])

  /** Explicitly save current profiles (use after editing; reads latest from ref). */
  const saveProfileNow = useCallback(() => {
    saveProfilesAsync(profilesRef.current)
    saveActiveProfileIdAsync(activeIdRef.current)
  }, [])

  const activeProfile = profiles.find((p) => p.id === activeId) ?? null

  const addProfile = useCallback((name: string) => {
    const newProfile: TopicProfile = {
      id: generateProfileId(),
      name,
      allowedTopics: [],
      excludedTopics: [],
      minimumAllowedMatches: 1,
    }
    setProfiles((prev) => [...prev, newProfile])
    setActiveId(newProfile.id)
    return newProfile
  }, [])

  const updateProfile = useCallback((id: string, updates: Partial<TopicProfile>) => {
    setProfiles((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
    )
  }, [])

  const deleteProfile = useCallback((id: string) => {
    setProfiles((prev) => prev.filter((p) => p.id !== id))
    if (activeId === id) setActiveId(profiles[0]?.id ?? null)
  }, [activeId, profiles])

  const loadPreset = useCallback((presetId: PresetId) => {
    const option = PRESET_OPTIONS.find((o) => o.id === presetId)
    if (!option) return
    const preset = option.getProfile()
    preset.id = generateProfileId()
    preset.name = option.label
    setProfiles((prev) => [...prev, preset])
    setActiveId(preset.id)
  }, [])

  const setActive = useCallback((id: string | null) => {
    setActiveId(id)
  }, [])

  return {
    profiles,
    activeProfile,
    activeId,
    setActive,
    addProfile,
    updateProfile,
    deleteProfile,
    loadPreset,
    saveProfileNow,
  }
}

export function updateTopicInProfile(
  profile: TopicProfile,
  group: 'allowedTopics' | 'excludedTopics',
  index: number,
  topic: Topic
): TopicProfile {
  const list = [...profile[group]]
  list[index] = topic
  return { ...profile, [group]: list }
}

export function removeTopicFromProfile(
  profile: TopicProfile,
  group: 'allowedTopics' | 'excludedTopics',
  index: number
): TopicProfile {
  const list = profile[group].filter((_, i) => i !== index)
  return { ...profile, [group]: list }
}

export function addTopicToProfile(
  profile: TopicProfile,
  group: 'allowedTopics' | 'excludedTopics',
  topic: Topic
): TopicProfile {
  return { ...profile, [group]: [...profile[group], topic] }
}
