import type { Campaign, TermMatchMetrics, TopicProfile } from '../types'

const CAMPAIGNS_KEY = 'ppc-analysis-campaigns'
const CAMPAIGN_SOURCE_ROWS_KEY = 'ppc-analysis-campaign-source-rows'
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

function restoreMap<V>(raw: unknown): Map<string, V> | undefined {
  if (raw instanceof Map) return raw as Map<string, V>
  if (raw && typeof raw === 'object' && 'data' in raw) {
    return new Map((raw as { data: [string, V][] }).data || [])
  }
  return undefined
}

function restoreTermMatchBreakdown(raw: unknown): Map<string, Map<string, TermMatchMetrics>> | undefined {
  const outer = restoreMap<unknown>(raw)
  if (!outer?.size) return undefined
  const result = new Map<string, Map<string, TermMatchMetrics>>()
  for (const [term, innerRaw] of outer) {
    const inner = restoreMap<TermMatchMetrics>(innerRaw)
    if (inner?.size) result.set(term, inner)
  }
  return result.size > 0 ? result : undefined
}

function ensureMaps(campaigns: Campaign[]): Campaign[] {
  return (campaigns || []).map((c) => {
    const normalizedToOriginal =
      c.normalizedToOriginal instanceof Map
        ? c.normalizedToOriginal
        : new Map((c.normalizedToOriginal as unknown as { data: [string, string][] })?.data || [])
    let normalizedToClicks: Map<string, number>
    if (c.normalizedToClicks instanceof Map) {
      normalizedToClicks = c.normalizedToClicks
    } else if (c.normalizedToClicks && typeof c.normalizedToClicks === 'object' && 'data' in c.normalizedToClicks) {
      normalizedToClicks = new Map(
        (c.normalizedToClicks as unknown as { data: [string, number][] }).data || []
      )
    } else {
      normalizedToClicks = new Map()
    }
    for (const k of normalizedToOriginal.keys()) {
      if (!normalizedToClicks.has(k)) normalizedToClicks.set(k, 0)
    }
    let normalizedToImpressions: Map<string, number>
    if (c.normalizedToImpressions instanceof Map) {
      normalizedToImpressions = c.normalizedToImpressions
    } else if (
      c.normalizedToImpressions &&
      typeof c.normalizedToImpressions === 'object' &&
      'data' in c.normalizedToImpressions
    ) {
      normalizedToImpressions = new Map(
        (c.normalizedToImpressions as unknown as { data: [string, number][] }).data || []
      )
    } else {
      normalizedToImpressions = new Map()
    }
    for (const k of normalizedToOriginal.keys()) {
      if (!normalizedToImpressions.has(k)) normalizedToImpressions.set(k, 0)
    }
    let normalizedToPurchases: Map<string, number>
    if (c.normalizedToPurchases instanceof Map) {
      normalizedToPurchases = c.normalizedToPurchases
    } else if (
      c.normalizedToPurchases &&
      typeof c.normalizedToPurchases === 'object' &&
      'data' in c.normalizedToPurchases
    ) {
      normalizedToPurchases = new Map(
        (c.normalizedToPurchases as unknown as { data: [string, number][] }).data || []
      )
    } else {
      normalizedToPurchases = new Map()
    }
    for (const k of normalizedToOriginal.keys()) {
      if (!normalizedToPurchases.has(k)) normalizedToPurchases.set(k, 0)
    }
    let normalizedToSpend: Map<string, number>
    if (c.normalizedToSpend instanceof Map) {
      normalizedToSpend = c.normalizedToSpend
    } else if (
      c.normalizedToSpend &&
      typeof c.normalizedToSpend === 'object' &&
      'data' in c.normalizedToSpend
    ) {
      normalizedToSpend = new Map(
        (c.normalizedToSpend as unknown as { data: [string, number][] }).data || []
      )
    } else {
      normalizedToSpend = new Map()
    }
    for (const k of normalizedToOriginal.keys()) {
      if (!normalizedToSpend.has(k)) normalizedToSpend.set(k, 0)
    }
    let normalizedToAttributedSales: Map<string, number>
    if (c.normalizedToAttributedSales instanceof Map) {
      normalizedToAttributedSales = c.normalizedToAttributedSales
    } else if (
      c.normalizedToAttributedSales &&
      typeof c.normalizedToAttributedSales === 'object' &&
      'data' in c.normalizedToAttributedSales
    ) {
      normalizedToAttributedSales = new Map(
        (c.normalizedToAttributedSales as unknown as { data: [string, number][] }).data || []
      )
    } else {
      normalizedToAttributedSales = new Map()
    }
    for (const k of normalizedToOriginal.keys()) {
      if (!normalizedToAttributedSales.has(k)) normalizedToAttributedSales.set(k, 0)
    }
    const normalizedToAcosPctWeightedSum = restoreMap<number>(c.normalizedToAcosPctWeightedSum) ?? new Map<string, number>()
    for (const k of normalizedToOriginal.keys()) {
      if (!normalizedToAcosPctWeightedSum.has(k)) normalizedToAcosPctWeightedSum.set(k, 0)
    }
    const normalizedToAcosWeight = restoreMap<number>(c.normalizedToAcosWeight) ?? new Map<string, number>()
    for (const k of normalizedToOriginal.keys()) {
      if (!normalizedToAcosWeight.has(k)) normalizedToAcosWeight.set(k, 0)
    }
    const bundleName =
      typeof c.bundleName === 'string' && c.bundleName.trim().length > 0 ? c.bundleName.trim() : undefined
    const termMatchBreakdown = restoreTermMatchBreakdown(c.termMatchBreakdown)
    const matchTargetKind =
      c.matchTargetKind === 'keywords' ||
      c.matchTargetKind === 'product-targets' ||
      c.matchTargetKind === 'targeting'
        ? c.matchTargetKind
        : undefined
    return {
      id: c.id,
      name: c.name,
      ...(bundleName != null ? { bundleName } : {}),
      terms: c.terms,
      normalizedToOriginal,
      normalizedToClicks,
      normalizedToImpressions,
      normalizedToPurchases,
      normalizedToSpend,
      normalizedToAttributedSales,
      normalizedToAcosPctWeightedSum,
      normalizedToAcosWeight,
      ...(termMatchBreakdown != null ? { termMatchBreakdown } : {}),
      ...(matchTargetKind != null ? { matchTargetKind } : {}),
    }
  })
}

function loadCampaignSourceRowsMap(): Record<string, string[][]> {
  try {
    const raw = localStorage.getItem(CAMPAIGN_SOURCE_ROWS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    return parsed as Record<string, string[][]>
  } catch {
    return {}
  }
}

function saveCampaignSourceRowsMap(map: Record<string, string[][]>): void {
  localStorage.setItem(CAMPAIGN_SOURCE_ROWS_KEY, JSON.stringify(map))
}

export function getStoredCampaignSourceRows(campaignId: string): string[][] | undefined {
  const rows = loadCampaignSourceRowsMap()[campaignId]
  return Array.isArray(rows) && rows.length > 0 ? rows : undefined
}

export function setStoredCampaignSourceRows(campaignId: string, rows: string[][]): void {
  const map = loadCampaignSourceRowsMap()
  map[campaignId] = rows
  saveCampaignSourceRowsMap(map)
}

export function removeStoredCampaignSourceRows(campaignId: string): void {
  const map = loadCampaignSourceRowsMap()
  if (!(campaignId in map)) return
  delete map[campaignId]
  saveCampaignSourceRowsMap(map)
}

function attachSourceRows(campaigns: Campaign[]): Campaign[] {
  const sourceMap = loadCampaignSourceRowsMap()
  let migrated = false
  const next = campaigns.map((c) => {
    let sourceRows = sourceMap[c.id]
    if ((!sourceRows || sourceRows.length === 0) && c.sourceRows && c.sourceRows.length > 0) {
      sourceRows = c.sourceRows
      sourceMap[c.id] = sourceRows
      migrated = true
    }
    if (sourceRows && sourceRows.length > 0) return { ...c, sourceRows }
    return c
  })
  if (migrated) saveCampaignSourceRowsMap(sourceMap)
  return next
}

export function loadCampaigns(): Campaign[] {
  try {
    const raw = localStorage.getItem(CAMPAIGNS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw, reviver) as Campaign[]
    return attachSourceRows(ensureMaps(parsed || []))
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
    return attachSourceRows(ensureMaps(Array.isArray(parsed) ? parsed : []))
  } catch {
    return null
  }
}

/** Save campaigns to API if configured. Always saves to localStorage as fallback. */
export async function saveCampaignsAsync(campaigns: Campaign[]): Promise<void> {
  const base = getApiBase()
  const stripped = campaigns.map(({ sourceRows: _sourceRows, ...rest }) => rest)
  if (base) {
    try {
      const body = JSON.stringify(stripped, replacer)
      await fetch(`${base}/api/campaigns`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body })
    } catch {
      /* ignore */
    }
  }
  saveCampaigns(campaigns)
}

export function saveCampaigns(campaigns: Campaign[]): void {
  const sourceMap = loadCampaignSourceRowsMap()
  for (const c of campaigns) {
    if (c.sourceRows && c.sourceRows.length > 0) sourceMap[c.id] = c.sourceRows
  }
  saveCampaignSourceRowsMap(sourceMap)
  const stripped = campaigns.map(({ sourceRows: _sourceRows, ...rest }) => rest)
  localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(stripped, replacer))
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
