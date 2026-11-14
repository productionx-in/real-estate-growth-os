// lib/integrations/webhooks/normalizer.ts
// Normalizes generic inbound webhook payloads from landing pages, marketing forms,
// webhooks, and third-party tools into the canonical InboundLeadPayload.

import type { InboundLeadPayload, IntegrationProvider } from '@/lib/integrations/types'

const NAME_KEYS = ['full_name', 'name', 'contact_name', 'customer_name', 'client_name', 'lead_name']
const FIRST_NAME_KEYS = ['first_name', 'fname', 'given_name']
const LAST_NAME_KEYS = ['last_name', 'lname', 'surname', 'family_name']
const PHONE_KEYS = ['phone_number', 'phone', 'mobile_number', 'mobile', 'contact_number', 'phone_no', 'telephone']
const EMAIL_KEYS = ['email', 'email_address', 'mail', 'user_email']

// Forbidden security-sensitive keys: external payloads must NEVER override tenant isolation
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

export function normalizeGenericWebhookPayload(
  raw: Record<string, unknown>,
  context: {
    connectionId: string
    provider?: IntegrationProvider
  }
): InboundLeadPayload {
  const customFields: Record<string, unknown> = {}
  const sourceMetadata: Record<string, unknown> = {}

  let name: string | null = null
  let firstName: string | null = null
  let lastName: string | null = null
  let phone: string | null = null
  let email: string | null = null

  let campaignId: string | null = null
  let campaignName: string | null = null
  let adId: string | null = null
  let adName: string | null = null
  let formId: string | null = null
  let formName: string | null = null
  let sourceUrl: string | null = null
  let notes: string | null = null
  let externalLeadId: string | null = null
  let idempotencyToken: string | null = null

  // Flatten and process payload keys
  for (const [rawKey, rawVal] of Object.entries(raw)) {
    if (rawVal === undefined || rawVal === null) continue
    const key = rawKey.trim().toLowerCase()

    // Strictly discard any caller-injected tenant or permission overrides
    if (RESTRICTED_KEYS.has(key)) continue

    const strVal = typeof rawVal === 'string' ? rawVal.trim() : String(rawVal).trim()
    if (!strVal) continue

    // 1. Identity & Contact Matching
    if (NAME_KEYS.includes(key)) {
      if (!name) name = strVal
    } else if (FIRST_NAME_KEYS.includes(key)) {
      if (!firstName) firstName = strVal
    } else if (LAST_NAME_KEYS.includes(key)) {
      if (!lastName) lastName = strVal
    } else if (PHONE_KEYS.includes(key)) {
      if (!phone) phone = strVal
    } else if (EMAIL_KEYS.includes(key)) {
      if (!email) email = strVal
    }
    // 2. Marketing Attribution Matching
    else if (['campaign_id', 'campaignid', 'utm_campaign_id'].includes(key)) {
      campaignId = strVal
    } else if (['campaign_name', 'campaignname', 'utm_campaign', 'campaign'].includes(key)) {
      campaignName = strVal
    } else if (['ad_id', 'adid', 'adset_id'].includes(key)) {
      adId = strVal
    } else if (['ad_name', 'adname', 'ad_title', 'ad'].includes(key)) {
      adName = strVal
    } else if (['form_id', 'formid'].includes(key)) {
      formId = strVal
    } else if (['form_name', 'formname', 'form_title', 'form'].includes(key)) {
      formName = strVal
    } else if (['source_url', 'sourceurl', 'page_url', 'referrer_url', 'referrer'].includes(key)) {
      sourceUrl = strVal
    }
    // 3. Notes & Requirements
    else if (['notes', 'message', 'comments', 'requirement', 'remarks'].includes(key)) {
      notes = strVal
    }
    // 4. Identifiers & Replay Tokens
    else if (['external_lead_id', 'externalleadid', 'lead_id', 'event_id'].includes(key)) {
      if (!externalLeadId) externalLeadId = strVal
    } else if (['idempotency_token', 'idempotency_key', 'idempotencytoken', 'nonce'].includes(key)) {
      if (!idempotencyToken) idempotencyToken = strVal
    }
    // 5. UTM tracking & custom questions
    else if (key.startsWith('utm_') || key.startsWith('meta_') || key.startsWith('fb_')) {
      sourceMetadata[rawKey] = rawVal
    } else {
      customFields[rawKey] = rawVal
      sourceMetadata[rawKey] = rawVal
    }
  }

  // Resolve final name
  const resolvedName = name || [firstName, lastName].filter(Boolean).join(' ') || 'Website Lead'

  return {
    connectionId: context.connectionId,
    provider: context.provider || 'website_webhook',
    externalLeadId: externalLeadId || idempotencyToken || undefined,
    idempotencyToken: idempotencyToken || externalLeadId || undefined,
    name: resolvedName,
    phone: phone || '',
    email: email || null,
    campaignId,
    campaignName,
    adId,
    adName,
    formId,
    formName,
    sourceUrl,
    notes,
    sourceMetadata: {
      ...sourceMetadata,
      ingested_via: 'generic_inbound_webhook',
      received_at: new Date().toISOString(),
    },
    customFields,
    rawPayload: raw,
  }
}
