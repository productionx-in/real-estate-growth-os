// lib/integrations/portals/types.ts
// Domain and raw webhook payload types for Indian Property Portals (99acres, Magicbricks, Housing.com).

export type PortalProvider =
  | 'property_portal_99acres'
  | 'property_portal_magicbricks'
  | 'property_portal_housing'

export interface NinetyNineAcresPayload {
  lead_id?: string
  buyer_name?: string
  buyer_phone?: string
  buyer_email?: string
  project_id?: string
  project_name?: string
  listing_id?: string
  property_type?: string
  bedroom?: string
  budget?: string
  locality?: string
  query?: string
  posted_date?: string
  [key: string]: unknown
}

export interface MagicbricksPayload {
  id?: string
  name?: string
  mobile?: string
  email?: string
  projectId?: string
  project?: string
  city?: string
  requirement?: string
  minBudget?: string | number
  maxBudget?: string | number
  created_on?: string
  sub_source?: string
  [key: string]: unknown
}

export interface HousingPayload {
  lead_id?: string
  user_name?: string
  user_phone?: string
  user_email?: string
  housing_project_id?: string
  project_name?: string
  message?: string
  budget_str?: string
  city?: string
  utm_source?: string
  utm_campaign?: string
  utm_medium?: string
  created_at?: string
  [key: string]: unknown
}

export interface PortalConnectionMetadata {
  portal_name: '99acres' | 'Magicbricks' | 'Housing.com'
  account_id?: string
  default_project_id?: string
  whitelisted_ips?: string[]
  api_key_last4?: string
  last_lead_at?: string
  total_leads_ingested?: number
}
