import type { ReactNode } from 'react'

export type PageId = 'campaigns' | 'dedup' | 'relevancy' | 'autoExact' | 'ppcTool' | 'campaignAsinShare'

export interface PageConfig {
  id: PageId
  label: string
  icon?: ReactNode
  /** Future: sub-pages for multilayered features */
  children?: PageConfig[]
}

export const PAGES: PageConfig[] = [
  { id: 'campaigns', label: 'Campaign Input' },
  { id: 'dedup', label: 'Deduplication' },
  { id: 'relevancy', label: 'Relevancy Filter' },
  { id: 'autoExact', label: 'Auto → Exact' },
  { id: 'ppcTool', label: 'Bidding Optimization' },
  { id: 'campaignAsinShare', label: 'Campaign ASIN Share' },
]
