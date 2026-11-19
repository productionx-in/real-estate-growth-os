// lib/integrations/inbound.ts
// Inbound lead processing engine: project mapping resolution, atomic idempotency protection,
// non-destructive multi-category deduplication, and resilient audit event logging.

import { createServiceClient } from '@/lib/supabase/server'
import {
  generateIdempotencyKey,
  normalizePhone,
  normalizeEmail,
  evaluateDeduplication,
} from './deduplication'
import type {
  InboundLeadPayload,
  InboundProcessingResult,
  IntegrationProjectMappingRecord,
} from './types'
import type { Json } from '@/types/database'

export async function processInboundLead(
  orgId: string,
  payload: InboundLeadPayload,
  options?: {
    customClient?: ReturnType<typeof createServiceClient>
    actorProfileId?: string | null
    /** When our server received the request (defaults to now); with created_at it times "receipt → saved". */
    receivedAt?: Date
    /** A project already resolved on the server (e.g. a published project showroom); never taken from a request body. */
    projectId?: string | null
  }
): Promise<InboundProcessingResult> {
  const service = options?.customClient ?? createServiceClient()
  const receivedAt = options?.receivedAt ?? new Date()

  const normPhone = normalizePhone(payload.phone)
  const normEmail = normalizeEmail(payload.email)

  if (!normPhone && !normEmail) {
    return {
      success: false,
      isDuplicate: false,
      duplicateOfId: null,
      projectId: null,
      routingStatus: 'unmapped',
      idempotencyKey: null,
      action: 'error',
      errorMessage: 'Inbound lead must have at least a valid phone number or email',
    }
  }

  // 1. Generate deterministic idempotency key for event-level replay protection (Case A)
  const idempotencyKey = generateIdempotencyKey({
    orgId,
    provider: payload.provider,
    externalLeadId: payload.externalLeadId,
    idempotencyToken: payload.idempotencyToken,
  })

  // 2. Pre-check for exact idempotency replay
  if (idempotencyKey) {
    const { data: existingByKey } = await service
      .from('leads')
      .select('id, org_id, project_id, is_duplicate, duplicate_of_id')
      .eq('org_id', orgId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()

    if (existingByKey && existingByKey.org_id === orgId) {
      await safeLogEvent(service, {
        org_id: orgId,
        connection_id: payload.connectionId ?? null,
        provider: payload.provider,
        event_type: 'lead_idempotent_replay',
        processing_status: 'duplicate',
        external_event_id: payload.externalLeadId ?? null,
        lead_id: existingByKey.id,
      })

      return {
        success: true,
        leadId: existingByKey.id,
        isDuplicate: existingByKey.is_duplicate ?? false,
        duplicateOfId: existingByKey.duplicate_of_id,
        projectId: existingByKey.project_id,
        routingStatus: existingByKey.project_id ? 'mapped' : 'unmapped',
        idempotencyKey,
        action: 'idempotent_replay',
        classification: 'duplicate_external_event',
      }
    }
  }

  // 3. Resolve Project Mapping
  let resolvedProjectId: string | null = options?.projectId ?? null
  let routingStatus: 'mapped' | 'unmapped' = 'unmapped'

  if (payload.connectionId) {
    // Verify connection exists in this organisation and is in active 'connected' status
    const { data: conn } = await service
      .from('integration_connections')
      .select('id, org_id, status')
      .eq('id', payload.connectionId)
      .eq('org_id', orgId)
      .maybeSingle()

    if (!conn) {
      await safeLogEvent(service, {
        org_id: orgId,
        connection_id: payload.connectionId,
        provider: payload.provider,
        event_type: 'lead_ingest_failed',
        processing_status: 'failed',
        external_event_id: payload.externalLeadId ?? null,
        error_message: 'Referenced integration connection does not exist in this organisation',
      })
      return {
        success: false,
        isDuplicate: false,
        duplicateOfId: null,
        projectId: null,
        routingStatus: 'unmapped',
        idempotencyKey,
        action: 'error',
        errorMessage: 'Integration connection not found in this organisation',
      }
    }

    if (conn.status !== 'connected') {
      await safeLogEvent(service, {
        org_id: orgId,
        connection_id: payload.connectionId,
        provider: payload.provider,
        event_type: 'lead_ingest_rejected',
        processing_status: 'failed',
        external_event_id: payload.externalLeadId ?? null,
        error_message: `Connection is ${conn.status}. Inbound leads are blocked for inactive or disabled connections.`,
      })
      return {
        success: false,
        isDuplicate: false,
        duplicateOfId: null,
        projectId: null,
        routingStatus: 'unmapped',
        idempotencyKey,
        action: 'error',
        errorMessage: `Connection is ${conn.status}. Inbound leads cannot be processed for inactive or disabled connections.`,
      }
    }

    const { data: mappings } = await service
      .from('integration_project_mappings')
      .select('*')
      .eq('org_id', orgId)
      .eq('connection_id', payload.connectionId)

    const activeMappings = (mappings as unknown as IntegrationProjectMappingRecord[]) ?? []

    // Priority 1: Match by campaign_id
    if (payload.campaignId) {
      const match = activeMappings.find(
        (m) =>
          m.external_identifier_type === 'campaign_id' &&
          m.external_identifier_value === payload.campaignId
      )
      if (match) resolvedProjectId = match.project_id
    }

    // Priority 2: Match by form_id
    if (!resolvedProjectId && payload.formId) {
      const match = activeMappings.find(
        (m) =>
          m.external_identifier_type === 'form_id' &&
          m.external_identifier_value === payload.formId
      )
      if (match) resolvedProjectId = match.project_id
    }

    // Priority 3: Match by page_id / source_url
    if (!resolvedProjectId && payload.sourceUrl) {
      const match = activeMappings.find(
        (m) =>
          m.external_identifier_type === 'page_id' &&
          m.external_identifier_value === payload.sourceUrl
      )
      if (match) resolvedProjectId = match.project_id
    }

    // Priority 3.5: Match by phone_number_id (WhatsApp Phone Routing)
    if (!resolvedProjectId && (payload.customFields?.phone_number_id || payload.formId)) {
      const targetPhoneId = String(payload.customFields?.phone_number_id || payload.formId)
      const match = activeMappings.find(
        (m) =>
          m.external_identifier_type === 'phone_number_id' &&
          m.external_identifier_value === targetPhoneId
      )
      if (match) resolvedProjectId = match.project_id
    }

    // Priority 3.6: Match by portal_project_id or portal_listing_id (Property Portals)
    if (
      !resolvedProjectId &&
      (payload.customFields?.portal_project_id ||
        payload.customFields?.portal_listing_id ||
        payload.formId ||
        payload.campaignId)
    ) {
      const candidateIds = [
        payload.customFields?.portal_project_id,
        payload.customFields?.portal_listing_id,
        payload.formId,
        payload.campaignId,
      ]
        .filter(Boolean)
        .map(String)

      const match = activeMappings.find(
        (m) =>
          (m.external_identifier_type === 'portal_project_id' ||
            m.external_identifier_type === 'portal_listing_id') &&
          candidateIds.includes(m.external_identifier_value)
      )
      if (match) resolvedProjectId = match.project_id
    }

    // Priority 4: Fallback to connection account_default
    if (!resolvedProjectId) {
      const match = activeMappings.find((m) => m.external_identifier_type === 'account_default')
      if (match) resolvedProjectId = match.project_id
    }

    if (resolvedProjectId) {
      routingStatus = 'mapped'
    } else {
      // Unmapped: Left as null for explicit operator assignment
      routingStatus = 'unmapped'
    }
  }

  // 4. Multi-Category Deduplication Check (A, B, C)
  // Phone and email are looked up separately with plain equality filters — never spliced into a PostgREST
  // filter string, where an email like "x@y.z,status.eq.new" could otherwise widen the match. Merged
  // records are skipped: a new enquiry is matched to the lead that is still being worked.
  const lookup = (column: 'phone' | 'email', value: string) => service
    .from('leads')
    .select('id, phone, email, external_lead_id, project_id, created_at')
    .eq('org_id', orgId)
    .eq(column, value)
    .is('merged_into_id', null)
    .order('created_at', { ascending: true })
    .limit(50)
  const found = await Promise.all([
    normPhone ? lookup('phone', normPhone) : Promise.resolve({ data: [] }),
    normEmail ? lookup('email', normEmail) : Promise.resolve({ data: [] }),
  ])
  const seen = new Set<string>()
  const candidates = found.flatMap((r) => r.data ?? [])
    .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
    .sort((a, b) => a.created_at.localeCompare(b.created_at))

  const dedupResult = evaluateDeduplication({
    inboundPhone: normPhone,
    inboundEmail: normEmail,
    externalLeadId: payload.externalLeadId,
    inboundProjectId: resolvedProjectId,
    existingLeads: candidates ?? [],
  })

  // If exact external event match was identified in existing leads (Case A)
  if (dedupResult.classification === 'duplicate_external_event' && dedupResult.duplicateOfId) {
    return {
      success: true,
      leadId: dedupResult.duplicateOfId,
      isDuplicate: true,
      duplicateOfId: dedupResult.duplicateOfId,
      projectId: resolvedProjectId,
      routingStatus,
      idempotencyKey,
      action: 'idempotent_replay',
      classification: 'duplicate_external_event',
    }
  }

  // 5. Inbound Lead Insertion
  const leadSourceEnum = mapProviderToLeadSource(payload.provider)

  let leadPriority: 'low' | 'medium' | 'high' = 'medium'
  let leadNotes = payload.notes ?? null

  if (dedupResult.classification === 'possible_duplicate_customer_enquiry') {
    leadPriority = 'low'
    leadNotes = payload.notes
      ? `${payload.notes}\n[System Note: Possible duplicate submission for same project]`
      : 'Flagged as potential duplicate enquiry for same project'
  } else if (dedupResult.classification === 'separate_customer_enquiry') {
    leadNotes = payload.notes
      ? `${payload.notes}\n[System Note: Existing contact enquiring for different project]`
      : 'Existing contact enquiring for different project'
  }

  const { data: insertedLead, error: insertError } = await service
    .from('leads')
    .insert({
      org_id: orgId,
      name: payload.name.trim() || 'Inbound Lead',
      phone: normPhone || payload.phone,
      email: normEmail,
      source: leadSourceEnum,
      source_platform: payload.provider,
      campaign_name: payload.campaignName ?? null,
      campaign_id: payload.campaignId ?? null,
      ad_name: payload.adName ?? null,
      ad_id: payload.adId ?? null,
      form_name: payload.formName ?? null,
      form_id: payload.formId ?? null,
      external_lead_id: payload.externalLeadId ?? null,
      source_url: payload.sourceUrl ?? null,
      connection_id: payload.connectionId ?? null,
      source_metadata: (payload.sourceMetadata ?? {}) as Json,
      idempotency_key: idempotencyKey,
      is_duplicate: dedupResult.isDuplicate,
      duplicate_of_id: dedupResult.duplicateOfId,
      project_id: resolvedProjectId,
      status: 'new',
      priority: leadPriority,
      notes: leadNotes,
      budget_min: payload.budgetMin ?? null,
      budget_max: payload.budgetMax ?? null,
      custom_fields: (payload.customFields ?? {}) as Json,
      received_at: receivedAt.toISOString(),
      source_submitted_at: plausibleSubmittedAt(payload.submittedAt, receivedAt),
    })
    .select()
    .single()

  // 6. Handle Database Errors & Race Conditions With Strict Exact-Constraint Discrimination
  if (insertError) {
    const rawMsg = insertError.message ?? ''

    // Exact Constraint A: uq_leads_org_idempotency_key
    const isIdempotencyKeyConflict =
      insertError.code === '23505' &&
      Boolean(idempotencyKey) &&
      rawMsg.includes('uq_leads_org_idempotency_key')

    // Exact Constraint B: uq_leads_connection_external_lead_id
    const isExternalLeadIdConflict =
      insertError.code === '23505' &&
      Boolean(payload.externalLeadId) &&
      Boolean(payload.connectionId) &&
      rawMsg.includes('uq_leads_connection_external_lead_id')

    if (isIdempotencyKeyConflict || isExternalLeadIdConflict) {
      let winningQuery = service
        .from('leads')
        .select('id, org_id, connection_id, project_id, is_duplicate, duplicate_of_id')
        .eq('org_id', orgId)

      if (isIdempotencyKeyConflict && idempotencyKey) {
        winningQuery = winningQuery.eq('idempotency_key', idempotencyKey)
      } else if (isExternalLeadIdConflict && payload.externalLeadId) {
        winningQuery = winningQuery.eq('external_lead_id', payload.externalLeadId)
      }

      const { data: winningLead } = await winningQuery.maybeSingle()

      // Verify that the retrieved winning lead strictly belongs to the expected organisation and connection
      if (winningLead && winningLead.org_id === orgId) {
        if (
          isExternalLeadIdConflict &&
          payload.connectionId &&
          winningLead.connection_id !== payload.connectionId
        ) {
          await safeLogEvent(service, {
            org_id: orgId,
            connection_id: payload.connectionId ?? null,
            provider: payload.provider,
            event_type: 'lead_ingest_failed',
            processing_status: 'failed',
            external_event_id: payload.externalLeadId ?? null,
            error_message: 'Conflict resolution mismatch: winning lead does not match expected connection',
          })

          return {
            success: false,
            isDuplicate: dedupResult.isDuplicate,
            duplicateOfId: dedupResult.duplicateOfId,
            projectId: resolvedProjectId,
            routingStatus,
            idempotencyKey,
            action: 'error',
            errorMessage: 'Conflict resolution mismatch: winning lead does not match expected connection',
          }
        }

        await safeLogEvent(service, {
          org_id: orgId,
          connection_id: payload.connectionId ?? null,
          provider: payload.provider,
          event_type: 'lead_idempotent_replay',
          processing_status: 'duplicate',
          external_event_id: payload.externalLeadId ?? null,
          lead_id: winningLead.id,
        })

        return {
          success: true,
          leadId: winningLead.id,
          isDuplicate: winningLead.is_duplicate ?? false,
          duplicateOfId: winningLead.duplicate_of_id,
          projectId: winningLead.project_id,
          routingStatus: winningLead.project_id ? 'mapped' : 'unmapped',
          idempotencyKey,
          action: 'idempotent_replay',
          classification: 'duplicate_external_event',
        }
      }
    }

    // Unrelated Database Failure (check constraint, tenant violation, FK failure, or other unique constraint)
    // NEVER silently report an unrelated error as an idempotent replay!
    await safeLogEvent(service, {
      org_id: orgId,
      connection_id: payload.connectionId ?? null,
      provider: payload.provider,
      event_type: 'lead_ingest_failed',
      processing_status: 'failed',
      external_event_id: payload.externalLeadId ?? null,
      error_message: `Database constraint failure [${insertError.code}]: ${insertError.message}`,
    })

    return {
      success: false,
      isDuplicate: dedupResult.isDuplicate,
      duplicateOfId: dedupResult.duplicateOfId,
      projectId: resolvedProjectId,
      routingStatus,
      idempotencyKey,
      action: 'error',
      errorMessage: insertError.message,
    }
  }

  // 7. Resilient Audit Event Logging (Does NOT fail the lead if event log fails)
  await safeLogEvent(service, {
    org_id: orgId,
    connection_id: payload.connectionId ?? null,
    provider: payload.provider,
    event_type: 'lead_ingested',
    processing_status: routingStatus === 'unmapped' ? 'unmapped' : 'processed',
    external_event_id: payload.externalLeadId ?? null,
    lead_id: insertedLead.id,
  })

  // 8. Log Lead Activity if an actor profile is available
  let actorId = options?.actorProfileId
  if (!actorId && payload.connectionId) {
    const { data: conn } = await service
      .from('integration_connections')
      .select('connected_by')
      .eq('id', payload.connectionId)
      .maybeSingle()
    if (conn?.connected_by) actorId = conn.connected_by
  }

  if (actorId) {
    try {
      await service.from('lead_activities').insert({
        lead_id: insertedLead.id,
        actor_id: actorId,
        type: 'created',
        note: `Inbound lead ingested from ${payload.provider} (${dedupResult.classification})`,
        metadata: {
          provider: payload.provider,
          campaign_name: payload.campaignName,
          ad_name: payload.adName,
          routing_status: routingStatus,
          classification: dedupResult.classification,
          is_duplicate: dedupResult.isDuplicate,
        } as Json,
      })
    } catch (actErr) {
      console.warn('Failed to insert lead creation activity:', actErr)
    }
  }

  let finalAction: InboundProcessingResult['action'] = 'created'
  if (dedupResult.classification === 'possible_duplicate_customer_enquiry') {
    finalAction = 'flagged_duplicate_created'
  } else if (dedupResult.classification === 'separate_customer_enquiry') {
    finalAction = 'separate_enquiry_created'
  }

  return {
    success: true,
    leadId: insertedLead.id,
    isDuplicate: dedupResult.isDuplicate,
    duplicateOfId: dedupResult.duplicateOfId,
    projectId: resolvedProjectId,
    routingStatus,
    idempotencyKey,
    action: finalAction,
    classification: dedupResult.classification,
  }
}

async function safeLogEvent(
  service: ReturnType<typeof createServiceClient>,
  params: {
    org_id: string
    connection_id: string | null
    provider: string
    event_type: string
    processing_status: 'received' | 'processed' | 'duplicate' | 'unmapped' | 'failed'
    external_event_id: string | null
    lead_id?: string | null
    error_message?: string | null
  }
) {
  try {
    await service.from('integration_event_logs').insert({
      org_id: params.org_id,
      connection_id: params.connection_id,
      provider: params.provider,
      event_type: params.event_type,
      processing_status: params.processing_status,
      external_event_id: params.external_event_id,
      lead_id: params.lead_id ?? null,
      error_message: params.error_message ?? null,
      processed_at: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Audit event log insertion failed (non-blocking):', err)
  }
}

function mapProviderToLeadSource(
  provider: InboundLeadPayload['provider']
): 'website' | 'meta_ads' | 'google_ads' | '99acres' | 'housing' | 'magicbricks' | 'whatsapp' | 'other' {
  switch (provider) {
    case 'meta_ads':
      return 'meta_ads'
    case 'google_ads':
      return 'google_ads'
    case 'website_webhook':
      return 'website'
    case 'whatsapp_cloud':
      return 'whatsapp'
    case 'property_portal_99acres':
      return '99acres'
    case 'property_portal_housing':
      return 'housing'
    case 'property_portal_magicbricks':
      return 'magicbricks'
    default:
      return 'other'
  }
}

/**
 * The source's own submission time, if it is believable: not in the future (beyond a minute of clock skew) and
 * not more than 30 days old (older values are backfills, not live deliveries, and would distort the timing).
 */
export function plausibleSubmittedAt(value: string | null | undefined, receivedAt: Date): string | null {
  if (!value) return null
  const t = /^\d{9,11}$/.test(value) ? Number(value) * 1000 : Date.parse(value)
  if (!Number.isFinite(t)) return null
  if (t > receivedAt.getTime() + 60_000 || t < receivedAt.getTime() - 30 * 86_400_000) return null
  return new Date(t).toISOString()
}
