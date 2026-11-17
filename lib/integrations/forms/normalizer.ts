// lib/integrations/forms/normalizer.ts
// Maps website enquiry form submissions into canonical InboundLeadPayload objects.

import type { InboundLeadPayload } from '@/lib/integrations/types'
import type { EnquirySubmissionInput } from './types'
import { safeHttpUrl } from '@/lib/integrations/website/attribution'

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
 * Normalizes website enquiry submission into InboundLeadPayload.
 */
export function normalizeWebsiteEnquiry(
  input: EnquirySubmissionInput,
  context: {
    connectionId: string
    resolvedProjectId?: string | null
  }
): InboundLeadPayload {
  const customFields: Record<string, unknown> = {}
  const sourceMetadata: Record<string, unknown> = {
    utm_source: input.utmSource || null,
    utm_medium: input.utmMedium || null,
    utm_campaign: input.utmCampaign || null,
    utm_term: input.utmTerm || null,
    utm_content: input.utmContent || null,
    // Only http(s) URLs are kept: these are shown as links to staff, so javascript: or data: must never pass.
    landing_page_url: safeHttpUrl(input.pageUrl),
    referrer_url: safeHttpUrl(input.referrer),
    unit_preference: input.unitPreference || null,
    budget_range: input.budget || null,
    schedule_site_visit: Boolean(input.scheduleSiteVisit),
    ingested_via: 'website_enquiry_form',
  }

  // Build composite requirements notes
  const notesParts: string[] = []
  if (input.unitPreference) notesParts.push(`Unit Preference: ${input.unitPreference}`)
  if (input.budget) notesParts.push(`Budget: ${input.budget}`)
  if (input.scheduleSiteVisit) notesParts.push(`Requested Site Visit: Yes`)
  if (input.notes) notesParts.push(input.notes)
  const combinedNotes = notesParts.length > 0 ? notesParts.join(' | ') : null

  // Capture any additional non-restricted fields
  for (const [key, val] of Object.entries(input)) {
    if (val === undefined || val === null) continue
    const lowerKey = key.toLowerCase()
    if (RESTRICTED_KEYS.has(lowerKey)) continue

    if (
      ![
        'name',
        'phone',
        'email',
        'projectId',
        'formId',
        'connectionId',
        'unitPreference',
        'budget',
        'notes',
        'scheduleSiteVisit',
        'utmSource',
        'utmMedium',
        'utmCampaign',
        'utmTerm',
        'utmContent',
        'pageUrl',
        'referrer',
        'externalLeadId',
        'idempotencyToken',
        'hpConfirm',
        'website_url_hp',
        'formLoadTime',
        'submissionTime',
      ].includes(key)
    ) {
      customFields[key] = val
    }
  }

  return {
    connectionId: context.connectionId,
    provider: 'website_webhook',
    name: input.name.trim(),
    phone: input.phone.trim(),
    email: input.email ? input.email.trim().toLowerCase() : null,
    campaignId: input.utmCampaign ? input.utmCampaign.trim() : null,
    campaignName: input.utmCampaign ? input.utmCampaign.trim() : null,
    formId: input.formId
      ? String(input.formId).trim()
      : input.projectId
      ? String(input.projectId).trim()
      : null,
    externalLeadId: input.externalLeadId ? String(input.externalLeadId).trim() : undefined,
    idempotencyToken: input.idempotencyToken ? String(input.idempotencyToken).trim() : undefined,
    sourceUrl: safeHttpUrl(input.pageUrl),
    notes: combinedNotes,
    sourceMetadata: {
      ...sourceMetadata,
      ...customFields,
    },
    customFields,
    rawPayload: input as unknown as Record<string, unknown>,
  }
}
