// lib/integrations/deduplication.ts
// Phone & email normalization, deterministic event idempotency, and multi-category non-destructive deduplication

import { createHash } from 'crypto'
import type { IntegrationProvider, DeduplicationCheckResult } from './types'

/**
 * Normalizes phone numbers to standard E.164-compatible format where possible.
 * Handles Indian numbers (10 digits starting with 6-9) with or without country code.
 */
export function normalizePhone(rawPhone: string): string {
  if (!rawPhone) return ''
  const trimmed = rawPhone.trim()
  const cleaned = trimmed.replace(/[^\d+]/g, '')

  if (cleaned.startsWith('+')) {
    return cleaned
  }

  if (cleaned.length === 11 && cleaned.startsWith('0')) {
    const withoutZero = cleaned.slice(1)
    if (/^[6-9]\d{9}$/.test(withoutZero)) {
      return `+91${withoutZero}`
    }
  }

  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return `+${cleaned}`
  }

  if (cleaned.length === 10 && /^[6-9]/.test(cleaned)) {
    return `+91${cleaned}`
  }

  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`
}

/**
 * Normalizes email address to lowercase and trimmed string.
 */
export function normalizeEmail(rawEmail?: string | null): string | null {
  if (!rawEmail) return null
  const trimmed = rawEmail.trim().toLowerCase()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Computes deterministic SHA-256 idempotency key strictly for EVENT-level deduplication (Case A).
 * Generated when an external lead ID or explicit client idempotency token is supplied.
 * If neither is present, returns null so ordinary subsequent enquiries from the same customer
 * are NEVER blocked by database unique constraints.
 */
export function generateIdempotencyKey(params: {
  orgId: string
  provider: IntegrationProvider
  externalLeadId?: string | null
  idempotencyToken?: string | null
}): string | null {
  const { orgId, provider, externalLeadId, idempotencyToken } = params

  if (externalLeadId && externalLeadId.trim()) {
    return createHash('sha256')
      .update(`ext:${orgId}:${provider}:${externalLeadId.trim()}`, 'utf8')
      .digest('hex')
  }

  if (idempotencyToken && idempotencyToken.trim()) {
    return createHash('sha256')
      .update(`token:${orgId}:${provider}:${idempotencyToken.trim()}`, 'utf8')
      .digest('hex')
  }

  return null
}

/**
 * Evaluates duplicate status against existing organisation leads.
 * CRITICAL RULE: Deduplication is strictly NON-DESTRUCTIVE.
 *
 * Categorizes inbound leads into three clear cases:
 * A. Duplicate delivery of the same external event (exact externalLeadId match).
 * B. Possible duplicate customer enquiry (same customer, same project or both unmapped).
 * C. Genuinely separate enquiry from the same customer (same customer, DIFFERENT project).
 */
export function evaluateDeduplication(params: {
  inboundPhone: string
  inboundEmail?: string | null
  externalLeadId?: string | null
  inboundProjectId?: string | null
  existingLeads: Array<{
    id: string
    phone: string
    email?: string | null
    external_lead_id?: string | null
    project_id?: string | null
    created_at: string
  }>
}): DeduplicationCheckResult {
  const { inboundPhone, inboundEmail, externalLeadId, inboundProjectId, existingLeads } = params
  const normPhone = normalizePhone(inboundPhone)
  const normEmail = normalizeEmail(inboundEmail)

  // 1. Check exact external lead ID match (Case A: Duplicate external event)
  if (externalLeadId && externalLeadId.trim()) {
    const trimmedExt = externalLeadId.trim()
    const extMatch = existingLeads.find((l) => l.external_lead_id === trimmedExt)
    if (extMatch) {
      return {
        isDuplicate: true,
        duplicateOfId: extMatch.id,
        classification: 'duplicate_external_event',
        matchReason: 'external_lead_id',
      }
    }
  }

  // 2. Find candidate contact match by normalized phone or email
  let contactMatch: typeof existingLeads[0] | undefined
  let matchReason: 'phone_match' | 'email_match' | undefined

  if (normPhone) {
    contactMatch = existingLeads.find((l) => normalizePhone(l.phone) === normPhone)
    if (contactMatch) matchReason = 'phone_match'
  }

  if (!contactMatch && normEmail) {
    contactMatch = existingLeads.find((l) => normalizeEmail(l.email) === normEmail)
    if (contactMatch) matchReason = 'email_match'
  }

  if (contactMatch) {
    // Check project context
    const isSameProject =
      (Boolean(inboundProjectId) && Boolean(contactMatch.project_id) && inboundProjectId === contactMatch.project_id) ||
      (!inboundProjectId && !contactMatch.project_id)

    if (isSameProject) {
      // Case B: Possible duplicate customer enquiry for the same project
      return {
        isDuplicate: true,
        duplicateOfId: contactMatch.id,
        classification: 'possible_duplicate_customer_enquiry',
        matchReason,
      }
    } else {
      // Case C: Genuinely separate enquiry from the same customer for a DIFFERENT project
      // A customer interested in Project A who now enquires about Project B must NEVER be discarded or flagged as duplicate!
      return {
        isDuplicate: false,
        duplicateOfId: null,
        classification: 'separate_customer_enquiry',
        relatedLeadId: contactMatch.id,
      }
    }
  }

  return {
    isDuplicate: false,
    duplicateOfId: null,
    classification: 'new_customer_enquiry',
  }
}
