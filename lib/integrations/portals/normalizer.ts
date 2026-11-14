// lib/integrations/portals/normalizer.ts
// Normalizes Indian Property Portal payloads (99acres, Magicbricks, Housing.com) into canonical InboundLeadPayload.

import type { InboundLeadPayload } from '@/lib/integrations/types'
import { normalizePhone } from '@/lib/integrations/deduplication'
import type {
  PortalProvider,
  NinetyNineAcresPayload,
  MagicbricksPayload,
  HousingPayload,
} from './types'

/**
 * Normalizes a raw 99acres lead submission.
 */
export function normalize99acresLead(
  raw: NinetyNineAcresPayload,
  connectionId: string
): InboundLeadPayload {
  const name = (raw.buyer_name || '').trim() || '99acres Lead'
  const phone = normalizePhone(raw.buyer_phone || '')
  const email = (raw.buyer_email || '').trim().toLowerCase() || null
  const externalLeadId = raw.lead_id ? String(raw.lead_id) : undefined

  // Construct composite enquiry notes
  const notesParts: string[] = []
  if (raw.project_name) notesParts.push(`Project: ${raw.project_name}`)
  if (raw.property_type || raw.bedroom) {
    notesParts.push(`Type: ${[raw.property_type, raw.bedroom].filter(Boolean).join(' - ')}`)
  }
  if (raw.budget) notesParts.push(`Budget: ${raw.budget}`)
  if (raw.locality) notesParts.push(`Locality: ${raw.locality}`)
  if (raw.query) notesParts.push(`Enquiry: "${raw.query.trim()}"`)

  return {
    connectionId,
    provider: 'property_portal_99acres',
    name,
    phone,
    email,
    externalLeadId,
    formId: raw.project_id ? String(raw.project_id) : raw.listing_id ? String(raw.listing_id) : undefined,
    notes: notesParts.length > 0 ? notesParts.join(' | ') : 'Enquiry from 99acres portal',
    customFields: {
      portal_name: '99acres',
      portal_project_id: raw.project_id ? String(raw.project_id) : null,
      portal_listing_id: raw.listing_id ? String(raw.listing_id) : null,
      budget: raw.budget || null,
      bedroom: raw.bedroom || null,
      property_type: raw.property_type || null,
      locality: raw.locality || null,
    },
    sourceMetadata: {
      portal_provider: '99acres',
      posted_date: raw.posted_date || null,
      ingested_via: 'portal_lead_push_api',
    },
  }
}

/**
 * Normalizes a raw Magicbricks lead submission.
 */
export function normalizeMagicbricksLead(
  raw: MagicbricksPayload,
  connectionId: string
): InboundLeadPayload {
  const name = (raw.name || '').trim() || 'Magicbricks Lead'
  const phone = normalizePhone(raw.mobile || '')
  const email = (raw.email || '').trim().toLowerCase() || null
  const externalLeadId = raw.id ? String(raw.id) : undefined

  // Format budget range
  let budgetStr = ''
  if (raw.minBudget && raw.maxBudget) {
    budgetStr = `₹${raw.minBudget} - ₹${raw.maxBudget}`
  } else if (raw.maxBudget) {
    budgetStr = `Up to ₹${raw.maxBudget}`
  }

  const notesParts: string[] = []
  if (raw.project) notesParts.push(`Project: ${raw.project}`)
  if (raw.requirement) notesParts.push(`Requirement: "${raw.requirement.trim()}"`)
  if (budgetStr) notesParts.push(`Budget: ${budgetStr}`)
  if (raw.city) notesParts.push(`City: ${raw.city}`)

  return {
    connectionId,
    provider: 'property_portal_magicbricks',
    name,
    phone,
    email,
    externalLeadId,
    formId: raw.projectId ? String(raw.projectId) : undefined,
    notes: notesParts.length > 0 ? notesParts.join(' | ') : 'Enquiry from Magicbricks portal',
    customFields: {
      portal_name: 'Magicbricks',
      portal_project_id: raw.projectId ? String(raw.projectId) : null,
      city: raw.city || null,
      min_budget: raw.minBudget != null ? String(raw.minBudget) : null,
      max_budget: raw.maxBudget != null ? String(raw.maxBudget) : null,
    },
    sourceMetadata: {
      portal_provider: 'Magicbricks',
      sub_source: raw.sub_source || null,
      created_on: raw.created_on || null,
      ingested_via: 'portal_partner_webhook',
    },
  }
}

/**
 * Normalizes a raw Housing.com lead submission.
 */
export function normalizeHousingLead(
  raw: HousingPayload,
  connectionId: string
): InboundLeadPayload {
  const name = (raw.user_name || '').trim() || 'Housing.com Lead'
  const phone = normalizePhone(raw.user_phone || '')
  const email = (raw.user_email || '').trim().toLowerCase() || null
  const externalLeadId = raw.lead_id ? String(raw.lead_id) : undefined

  const notesParts: string[] = []
  if (raw.project_name) notesParts.push(`Project: ${raw.project_name}`)
  if (raw.message) notesParts.push(`Message: "${raw.message.trim()}"`)
  if (raw.budget_str) notesParts.push(`Budget: ${raw.budget_str}`)
  if (raw.city) notesParts.push(`City: ${raw.city}`)

  return {
    connectionId,
    provider: 'property_portal_housing',
    name,
    phone,
    email,
    externalLeadId,
    formId: raw.housing_project_id ? String(raw.housing_project_id) : undefined,
    campaignId: raw.utm_campaign || undefined,
    campaignName: raw.utm_campaign || undefined,
    adId: raw.utm_source || undefined,
    notes: notesParts.length > 0 ? notesParts.join(' | ') : 'Enquiry from Housing.com portal',
    customFields: {
      portal_name: 'Housing.com',
      portal_project_id: raw.housing_project_id ? String(raw.housing_project_id) : null,
      budget: raw.budget_str || null,
      city: raw.city || null,
    },
    sourceMetadata: {
      portal_provider: 'Housing.com',
      utm_source: raw.utm_source || null,
      utm_campaign: raw.utm_campaign || null,
      utm_medium: raw.utm_medium || null,
      created_at: raw.created_at || null,
      ingested_via: 'portal_realtime_api',
    },
  }
}

/**
 * Universal dispatcher that normalizes any Indian property portal payload.
 */
export function normalizePortalLead(
  provider: PortalProvider,
  rawPayload: Record<string, unknown>,
  connectionId: string
): InboundLeadPayload {
  switch (provider) {
    case 'property_portal_99acres':
      return normalize99acresLead(rawPayload as NinetyNineAcresPayload, connectionId)
    case 'property_portal_magicbricks':
      return normalizeMagicbricksLead(rawPayload as MagicbricksPayload, connectionId)
    case 'property_portal_housing':
      return normalizeHousingLead(rawPayload as HousingPayload, connectionId)
    default:
      throw new Error(`Unsupported property portal provider: ${provider}`)
  }
}
