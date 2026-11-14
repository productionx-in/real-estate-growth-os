// lib/integrations/outbound/types.ts
// Domain types for customer outbound webhooks, developer API keys, and delivery logs.

export type WebhookEventType =
  | 'lead.created'
  | 'lead.updated'
  | 'lead.status_changed'
  | 'inventory.status_changed'
  | 'site_visit.scheduled'
  | 'booking.created'

export interface WebhookSubscription {
  id: string
  org_id: string
  url: string
  event_types: WebhookEventType[]
  is_active: boolean
  secret_ref?: string | null
  description?: string | null
  created_at: string
  updated_at: string
}

export interface WebhookDeliveryLog {
  id: string
  org_id: string
  subscription_id: string
  event_type: WebhookEventType
  payload: Record<string, unknown>
  response_status?: number | null
  response_body?: string | null
  attempt: number
  success: boolean
  error_message?: string | null
  created_at: string
}

export interface DeveloperApiKey {
  id: string
  org_id: string
  name: string
  key_prefix: string // e.g. "px_live_ab12"
  permissions: string[]
  is_active: boolean
  last_used_at?: string | null
  created_at: string
  expires_at?: string | null
}
