// lib/integrations/whatsapp/types.ts
// Domain and webhook payload types for Meta WhatsApp Business Cloud API.

export interface WhatsAppProfile {
  name?: string
}

export interface WhatsAppContact {
  profile?: WhatsAppProfile
  wa_id: string
}

export interface WhatsAppReferral {
  source_url?: string
  source_type?: 'ad' | 'post' | string
  source_id?: string // Ad ID or Campaign ID
  headline?: string
  body?: string
  media_type?: string
  image_url?: string
  video_url?: string
  thumbnail_url?: string
  ctwa_clid?: string // Click-to-WhatsApp Click ID
}

export interface WhatsAppTextMessage {
  body: string
}

export interface WhatsAppMediaMessage {
  id: string
  mime_type?: string
  sha256?: string
  caption?: string
  filename?: string
}

export interface WhatsAppButtonReply {
  id: string
  title: string
}

export interface WhatsAppInteractiveReply {
  type: 'button_reply' | 'list_reply'
  button_reply?: WhatsAppButtonReply
  list_reply?: {
    id: string
    title: string
    description?: string
  }
}

export interface WhatsAppLocationMessage {
  latitude: number
  longitude: number
  name?: string
  address?: string
}

export interface WhatsAppInboundMessage {
  from: string // e.g. "919876543210"
  id: string // e.g. "wamid.HBgLMTU1NTAy..."
  timestamp: string // Unix epoch string
  type: 'text' | 'image' | 'document' | 'video' | 'audio' | 'button' | 'interactive' | 'location' | 'contacts' | 'system' | string
  text?: WhatsAppTextMessage
  image?: WhatsAppMediaMessage
  document?: WhatsAppMediaMessage
  video?: WhatsAppMediaMessage
  button?: { text: string; payload: string }
  interactive?: WhatsAppInteractiveReply
  location?: WhatsAppLocationMessage
  referral?: WhatsAppReferral
  context?: {
    from?: string
    id?: string
    referred_product?: Record<string, unknown>
  }
  errors?: Array<{
    code: number
    title: string
    message?: string
    error_data?: { details: string }
  }>
}

export interface WhatsAppMessageStatus {
  id: string // wamid
  status: 'sent' | 'delivered' | 'read' | 'failed'
  timestamp: string
  recipient_id: string
  conversation?: {
    id: string
    origin?: { type: string }
    expiration_timestamp?: string
  }
  pricing?: {
    billable: boolean
    pricing_model: string
    category: string
  }
  errors?: Array<{
    code: number
    title: string
    message?: string
  }>
}

export interface WhatsAppWebhookChangeValue {
  messaging_product: 'whatsapp'
  metadata: {
    display_phone_number: string
    phone_number_id: string
  }
  contacts?: WhatsAppContact[]
  messages?: WhatsAppInboundMessage[]
  statuses?: WhatsAppMessageStatus[]
}

export interface WhatsAppWebhookChange {
  value: WhatsAppWebhookChangeValue
  field: 'messages'
}

export interface WhatsAppWebhookEntry {
  id: string // WABA ID
  changes: WhatsAppWebhookChange[]
}

export interface WhatsAppWebhookPayload {
  object: 'whatsapp_business_account'
  entry: WhatsAppWebhookEntry[]
}

export type ConsentStatus = 'opted_in' | 'opted_out' | 'unknown'

export interface WhatsAppConsentRecord {
  phoneNumber: string
  consentStatus: ConsentStatus
  lastUpdated: string
  reason?: string
}
