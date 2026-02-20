import type { Campaign, TopicProfile } from '../types'

const CAMPAIGNS_KEY = 'ppc-analysis-campaigns'
const PROFILES_KEY = 'ppc-analysis-profiles'
const ACTIVE_PROFILE_KEY = 'ppc-analysis-active-profile'

/** Backend base URL. Set VITE_API_URL for production; in dev we use same origin so Vite proxy works. */
export function getApiBase(): string {
  const env = import.meta.env?.VITE_API_URL as string | undefined
  if (env) return env
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin
  return ''
}

function reviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>).data)) {
    const obj = value as { data: [string, string][] }
    return new Map(obj.data as [string, string][])
  }
  return value
}

function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Map) {
    return { data: Array.from(value.entries()) }
  }
  return value
}

function ensureMaps(campaigns: Campaign[]): Campaign[] {
  return (campaigns || []).map((c) => ({
    ...c,
    normalizedToOriginal: c.normalizedToOriginal instanceof Map
      ? c.normalizedToOriginal
      : new Map((c.normalizedToOriginal as unknown as { data: [string, string][] })?.data || []),
  }))
}

export function loadCampaigns(): Campaign[] {
  try {
    const raw = localStorage.getItem(CAMPAIGNS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw, reviver) as Campaign[]
    return ensureMaps(parsed || [])
  } catch {
    return []
  }
}

/** Load campaigns from API if configured. Returns null if API not used or failed (caller keeps localStorage data). */
export async function loadCampaignsAsync(): Promise<Campaign[] | null> {
  const base = getApiBase()
  if (!base) return null
  try {
    const res = await fetch(`${base}/api/campaigns`)
    if (!res.ok) return null
    const parsed = (await res.json()) as Campaign[]
    return ensureMaps(Array.isArray(parsed) ? parsed : [])
  } catch {
    return null
  }
}

/** Save campaigns to API if configured. Always saves to localStorage as fallback. */
export async function saveCampaignsAsync(campaigns: Campaign[]): Promise<void> {
  const base = getApiBase()
  if (base) {
    try {
      const body = JSON.stringify(campaigns, replacer)
      await fetch(`${base}/api/campaigns`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body })
    } catch {
      /* ignore */
    }
  }
  saveCampaigns(campaigns)
}

export function saveCampaigns(campaigns: Campaign[]): void {
  localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(campaigns, replacer))
}

export function loadProfiles(): TopicProfile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY)
    if (!raw) return []
    return JSON.parse(raw) as TopicProfile[]
  } catch {
    return []
  }
}

export function saveProfiles(profiles: TopicProfile[]): void {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles))
}

export function loadActiveProfileId(): string | null {
  return localStorage.getItem(ACTIVE_PROFILE_KEY)
}

export function saveActiveProfileId(id: string | null): void {
  if (id) localStorage.setItem(ACTIVE_PROFILE_KEY, id)
  else localStorage.removeItem(ACTIVE_PROFILE_KEY)
}

/** Load profiles from API. Returns null if API not used or failed. */
export async function loadProfilesAsync(): Promise<TopicProfile[] | null> {
  const base = getApiBase()
  if (!base) return null
  try {
    const res = await fetch(`${base}/api/profiles`)
    if (!res.ok) return null
    const data = await res.json()
    return Array.isArray(data) ? data : null
  } catch {
    return null
  }
}

/** Save profiles to API if configured. */
export async function saveProfilesAsync(profiles: TopicProfile[]): Promise<void> {
  const base = getApiBase()
  if (base) {
    try {
      await fetch(`${base}/api/profiles`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profiles) })
    } catch {
      /* ignore */
    }
  }
  saveProfiles(profiles)
}

/** Load active profile ID from API. Returns null if API not used or failed. */
export async function loadActiveProfileIdAsync(): Promise<string | null | undefined> {
  const base = getApiBase()
  if (!base) return undefined
  try {
    const res = await fetch(`${base}/api/active-profile-id`)
    if (!res.ok) return undefined
    const data = await res.json()
    return data === null || data === undefined ? null : data
  } catch {
    return undefined
  }
}

/** Save active profile ID to API if configured. */
export async function saveActiveProfileIdAsync(id: string | null): Promise<void> {
  const base = getApiBase()
  if (base) {
    try {
      await fetch(`${base}/api/active-profile-id`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(id) })
    } catch {
      /* ignore */
    }
  }
  saveActiveProfileId(id)
}
