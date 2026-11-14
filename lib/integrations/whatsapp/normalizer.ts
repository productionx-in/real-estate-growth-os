// lib/integrations/whatsapp/normalizer.ts
// Normalizes WhatsApp Business Cloud API inbound events and Click-to-WhatsApp Ads referrals
// into canonical InboundLeadPayload objects for the central CRM pipeline.

import type { InboundLeadPayload } from '@/lib/integrations/types'
import type { WhatsAppInboundMessage, WhatsAppContact } from './types'
import { normalizePhone } from '@/lib/integrations/deduplication'

const RESTRICTED_KEYS = new Set([
  'org_id',
  'orgid',
  'tenant_id',
  'tenantid',
  'organization_id',
  'organisation_id',
  'profile_id',
  'user_id',
  'role',
  'is_admin',
])

/**
 * Normalizes an incoming WhatsApp message into a canonical InboundLeadPayload.
 */
export function normalizeWhatsAppInboundMessage(params: {
  connectionId: string
  phoneNumberId: string
  displayPhoneNumber?: string
  contact?: WhatsAppContact
  message: WhatsAppInboundMessage
}): InboundLeadPayload {
  const { connectionId, phoneNumberId, displayPhoneNumber, contact, message } = params

  // 1. Resolve contact name
  const rawName = contact?.profile?.name || ''
  const name = rawName.trim() || 'WhatsApp Lead'

  // 2. Resolve customer phone number to E.164 format
  const rawPhone = message.from || contact?.wa_id || ''
  const phone = normalizePhone(rawPhone)

  // 3. Extract message text body based on type
  let messageBody = ''
  if (message.type === 'text' && message.text) {
    messageBody = message.text.body || ''
  } else if (message.type === 'button' && message.button) {
    messageBody = `[Button Response: ${message.button.text}]`
  } else if (message.type === 'interactive' && message.interactive) {
    const btn = message.interactive.button_reply?.title
    const list = message.interactive.list_reply?.title
    messageBody = `[Interactive Selection: ${btn || list || 'Selected'}]`
  } else if (message.type === 'location' && message.location) {
    messageBody = `[Location Shared: ${message.location.name || ''} (${message.location.latitude}, ${message.location.longitude})]`
  } else if (message.type === 'image' && message.image) {
    messageBody = `[Image Received${message.image.caption ? `: ${message.image.caption}` : ''}]`
  } else if (message.type === 'document' && message.document) {
    messageBody = `[Document Received: ${message.document.filename || message.document.caption || 'File'}]`
  } else {
    messageBody = `[${message.type.toUpperCase()} Message]`
  }

  // 4. Click-to-WhatsApp Ads Attribution (Referral Object)
  const referral = message.referral
  const campaignId = referral?.source_id || null
  const campaignName = referral?.headline || (referral ? `WhatsApp Ad (${referral.source_type || 'ad'})` : null)
  const adId = referral?.source_id || null
  const adName = referral?.headline || null
  const sourceUrl = referral?.source_url || null

  // 5. Composite requirements and notes
  const notesParts: string[] = []
  if (referral?.headline) notesParts.push(`Ad Headline: "${referral.headline}"`)
  if (referral?.body) notesParts.push(`Ad Copy: "${referral.body}"`)
  if (messageBody) notesParts.push(`Message: ${messageBody}`)
  const notes = notesParts.length > 0 ? notesParts.join(' | ') : null

  // 6. Source metadata & custom fields
  const sourceMetadata: Record<string, unknown> = {
    whatsapp_phone_number_id: phoneNumberId,
    whatsapp_display_phone_number: displayPhoneNumber || null,
    whatsapp_message_id: message.id, // wamid
    whatsapp_message_type: message.type,
    whatsapp_timestamp: message.timestamp,
    has_click_to_whatsapp_referral: Boolean(referral),
    referral_source_id: referral?.source_id || null,
    referral_source_type: referral?.source_type || null,
    referral_headline: referral?.headline || null,
    referral_source_url: referral?.source_url || null,
    referral_media_type: referral?.media_type || null,
    referral_ctwa_clid: referral?.ctwa_clid || null,
    ingested_via: 'whatsapp_cloud_api',
  }

  const customFields: Record<string, unknown> = {
    phone_number_id: phoneNumberId,
    wamid: message.id,
    message_type: message.type,
  }

  // Sanitize any restricted keys
  for (const key of Object.keys(sourceMetadata)) {
    if (RESTRICTED_KEYS.has(key.toLowerCase())) {
      delete sourceMetadata[key]
    }
  }

  return {
    connectionId,
    provider: 'whatsapp_cloud',
    externalLeadId: message.id, // wamid provides deterministic event idempotency
    name,
    phone,
    campaignId,
    campaignName,
    adId,
    adName,
    formId: phoneNumberId, // enables mapping by phone_number_id
    sourceUrl,
    notes,
    sourceMetadata,
    customFields,
    rawPayload: message as unknown as Record<string, unknown>,
  }
}
