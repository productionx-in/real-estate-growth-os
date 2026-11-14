// lib/integrations/meta/lead-normalizer.ts
// Maps raw Meta Graph API leadgen responses into canonical InboundLeadPayload objects.

import type { RawMetaLeadData } from './client'
import type { InboundLeadPayload } from '@/lib/integrations/types'

const NAME_KEYS = ['full_name', 'name', 'your_name', 'contact_name', 'client_name']
const FIRST_NAME_KEYS = ['first_name', 'given_name', 'fname']
const LAST_NAME_KEYS = ['last_name', 'family_name', 'surname', 'lname']
const PHONE_KEYS = ['phone_number', 'phone', 'mobile_number', 'mobile', 'contact_number', 'telephone']
const EMAIL_KEYS = ['email', 'email_address', 'work_email', 'personal_email']

/**
 * Normalizes raw Meta lead submission into InboundLeadPayload ready for central CRM ingestion.
 */
export function normalizeMetaLead(
  raw: RawMetaLeadData,
  connectionId?: string
): InboundLeadPayload {
  const fields = raw.field_data || []
  const customFields: Record<string, unknown> = {}

  let fullName: string | null = null
  let firstName: string | null = null
  let lastName: string | null = null
  let phone: string | null = null
  let email: string | null = null

  for (const item of fields) {
    const rawKey = item.name.trim().toLowerCase()
    const val = Array.isArray(item.values) && item.values.length > 0 ? String(item.values[0]).trim() : ''

    if (!val) continue

    if (NAME_KEYS.includes(rawKey)) {
      if (!fullName) fullName = val
    } else if (FIRST_NAME_KEYS.includes(rawKey)) {
      if (!firstName) firstName = val
    } else if (LAST_NAME_KEYS.includes(rawKey)) {
      if (!lastName) lastName = val
    } else if (PHONE_KEYS.includes(rawKey)) {
      if (!phone) phone = val
    } else if (EMAIL_KEYS.includes(rawKey)) {
      if (!email) email = val
    } else {
      // Custom questions, preferences, timelines, budget fields
      customFields[item.name] = val
    }
  }

  // Derive resolved name
  const resolvedName = fullName || [firstName, lastName].filter(Boolean).join(' ') || 'Meta Lead'

  return {
    connectionId,
    provider: 'meta_ads',
    externalLeadId: raw.id,
    name: resolvedName,
    phone: phone || '',
    email: email || null,
    campaignId: raw.campaign_id || null,
    campaignName: raw.campaign_name || null,
    adId: raw.ad_id || null,
    adName: raw.ad_name || null,
    formId: raw.form_id || null,
    sourceMetadata: {
      meta_adset_id: raw.adset_id || null,
      meta_adset_name: raw.adset_name || null,
      meta_page_id: raw.page_id || null,
      meta_created_time: raw.created_time || null,
      ...customFields,
    },
    customFields,
    rawPayload: raw as unknown as Record<string, unknown>,
  }
}
