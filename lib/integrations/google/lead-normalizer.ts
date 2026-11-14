// lib/integrations/google/lead-normalizer.ts
// Maps raw Google Ads Lead Form webhook payloads into canonical InboundLeadPayload objects.

import type { InboundLeadPayload } from '@/lib/integrations/types'

export interface GoogleLeadColumnData {
  column_id: string
  string_value?: string
  column_name?: string
}

export interface RawGoogleLeadData {
  lead_id: string
  api_version?: string
  form_id: string
  campaign_id?: string
  google_key?: string
  is_test?: boolean
  gcl_id?: string
  adgroup_id?: string
  creative_id?: string
  user_column_data?: GoogleLeadColumnData[]
  [key: string]: unknown
}

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
 * Normalizes raw Google Ads lead form submission into canonical InboundLeadPayload.
 */
export function normalizeGoogleLead(
  raw: RawGoogleLeadData,
  connectionId?: string
): InboundLeadPayload {
  const customFields: Record<string, unknown> = {}
  const sourceMetadata: Record<string, unknown> = {
    google_gcl_id: raw.gcl_id || null,
    google_adgroup_id: raw.adgroup_id || null,
    google_creative_id: raw.creative_id || null,
    google_is_test: Boolean(raw.is_test),
    google_api_version: raw.api_version || '1.0',
    ingested_via: 'google_ads_lead_form_webhook',
  }

  let fullName: string | null = null
  let firstName: string | null = null
  let lastName: string | null = null
  let phone: string | null = null
  let email: string | null = null
  let notes: string | null = null

  const columns = Array.isArray(raw.user_column_data) ? raw.user_column_data : []

  for (const col of columns) {
    if (!col || typeof col !== 'object') continue
    const colId = (col.column_id || '').toUpperCase().trim()
    const val = typeof col.string_value === 'string' ? col.string_value.trim() : String(col.string_value || '').trim()

    if (!val) continue

    // Security guard: discard any tenant spoofing attempts
    if (RESTRICTED_KEYS.has(colId.toLowerCase())) continue

    switch (colId) {
      case 'FULL_NAME':
        if (!fullName) fullName = val
        break
      case 'FIRST_NAME':
        if (!firstName) firstName = val
        break
      case 'LAST_NAME':
        if (!lastName) lastName = val
        break
      case 'PHONE_NUMBER':
        if (!phone) phone = val
        break
      case 'EMAIL':
        if (!email) email = val
        break
      case 'CITY':
      case 'POSTAL_CODE':
      case 'REGION':
      case 'COUNTRY':
      case 'COMPANY_NAME':
      case 'JOB_TITLE':
      case 'WORK_EMAIL':
      case 'WORK_PHONE':
        customFields[colId.toLowerCase()] = val
        break
      default:
        // Custom questions or requirements
        if (col.column_name && /requirement|message|note|comment/i.test(col.column_name)) {
          notes = notes ? `${notes}; ${col.column_name}: ${val}` : `${col.column_name}: ${val}`
        }
        customFields[col.column_name || colId] = val
        break
    }
  }

  // Derive resolved name
  const resolvedName = fullName || [firstName, lastName].filter(Boolean).join(' ') || 'Google Ads Lead'

  return {
    connectionId,
    provider: 'google_ads',
    externalLeadId: raw.lead_id,
    name: resolvedName,
    phone: phone || '',
    email: email || null,
    campaignId: raw.campaign_id ? String(raw.campaign_id) : null,
    adId: raw.creative_id ? String(raw.creative_id) : null,
    formId: raw.form_id ? String(raw.form_id) : null,
    notes,
    sourceMetadata: {
      ...sourceMetadata,
      ...customFields,
    },
    customFields,
    rawPayload: raw,
  }
}
