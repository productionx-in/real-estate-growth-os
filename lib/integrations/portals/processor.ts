// lib/integrations/portals/processor.ts
// End-to-end inbound webhook event processor for Indian Property Portals (99acres, Magicbricks, Housing.com).

import { createServiceClient } from '@/lib/supabase/server'
import { decryptCredential } from '@/lib/integrations/crypto'
import { processInboundLead } from '@/lib/integrations/inbound'
import { verifyPortalAuthToken, sanitizePortalPayload } from './validator'
import { normalizePortalLead } from './normalizer'
import type { PortalProvider } from './types'
import type { Json } from '@/types/database'

export interface PortalProcessingResult {
  success: boolean
  leadId?: string | null
  isDuplicate?: boolean
  processingStatus?: 'processed' | 'duplicate' | 'unmapped' | 'failed'
  error?: string
  errorCode?: string
}

/**
 * Processes an inbound lead webhook push from a property portal.
 */
export async function processPortalWebhook(params: {
  provider: PortalProvider
  connectionId: string
  rawPayload: Record<string, unknown>
  authHeader: string | null | undefined
}): Promise<PortalProcessingResult> {
  const { provider, connectionId, rawPayload, authHeader } = params
  const service = createServiceClient()

  // 1. Retrieve connection
  const { data: conn } = await service
    .from('integration_connections')
    .select('id, org_id, provider, status, credential_ref, metadata')
    .eq('id', connectionId)
    .maybeSingle()

  if (!conn) {
    return {
      success: false,
      error: 'Integration connection not found',
      errorCode: 'connection_not_found',
    }
  }

  // 2. Validate provider matches connection
  if (conn.provider !== provider) {
    return {
      success: false,
      error: `Connection provider mismatch: expected ${conn.provider}, received ${provider}`,
      errorCode: 'provider_mismatch',
    }
  }

  // 3. Verify connection is active
  if (conn.status !== 'connected') {
    return {
      success: false,
      error: `Connection is ${conn.status}. Inbound portal leads are blocked for inactive connections.`,
      errorCode: 'connection_inactive',
    }
  }

  // 4. Verify API Key / Token Authentication
  if (!conn.credential_ref) {
    return {
      success: false,
      error: 'Portal API authentication secret is not configured for this connection',
      errorCode: 'unconfigured_secret',
    }
  }

  let expectedSecret: string
  try {
    expectedSecret = decryptCredential(conn.credential_ref)
  } catch (err: unknown) {
    return {
      success: false,
      error: `Failed to decrypt connection secret: ${err instanceof Error ? err.message : String(err)}`,
      errorCode: 'decryption_error',
    }
  }

  const isAuthValid = verifyPortalAuthToken(authHeader, expectedSecret)
  if (!isAuthValid) {
    // Log unauthorized attempt without leaking token
    await service.from('integration_event_logs').insert({
      org_id: conn.org_id,
      connection_id: conn.id,
      provider,
      event_type: 'portal_auth_rejected',
      processing_status: 'failed',
      error_message: 'Invalid portal API authentication key or Bearer token',
      processed_at: new Date().toISOString(),
    })

    return {
      success: false,
      error: 'Unauthorized. Invalid portal API key or Bearer token.',
      errorCode: 'unauthorized',
    }
  }

  // 5. Sanitize payload against privilege escalation
  const cleanPayload = sanitizePortalPayload(rawPayload)

  // 6. Normalize payload into canonical InboundLeadPayload
  let normalizedLead
  try {
    normalizedLead = normalizePortalLead(provider, cleanPayload, conn.id)
  } catch (err: unknown) {
    return {
      success: false,
      error: `Payload normalization failed: ${err instanceof Error ? err.message : String(err)}`,
      errorCode: 'normalization_error',
    }
  }

  // 7. Ingest into central CRM pipeline
  const ingestResult = await processInboundLead(conn.org_id, normalizedLead)

  // 8. Safe audit logging (Zero credentials leaked)
  await service.from('integration_event_logs').insert({
    org_id: conn.org_id,
    connection_id: conn.id,
    provider,
    event_type: 'portal_lead_received',
    external_event_id: normalizedLead.externalLeadId ?? null,
    processing_status: ingestResult.isDuplicate
      ? 'duplicate'
      : ingestResult.routingStatus === 'unmapped'
      ? 'unmapped'
      : ingestResult.success
      ? 'processed'
      : 'failed',
    lead_id: ingestResult.leadId ?? null,
    error_message: ingestResult.errorMessage ?? null,
    processed_at: new Date().toISOString(),
  })

  // 9. Update connection metadata (last lead timestamp & total count)
  try {
    const meta = (conn.metadata || {}) as Record<string, unknown>
    const currentTotal = typeof meta.total_leads_ingested === 'number' ? meta.total_leads_ingested : 0

    await service
      .from('integration_connections')
      .update({
        metadata: {
          ...meta,
          last_lead_at: new Date().toISOString(),
          total_leads_ingested: currentTotal + (ingestResult.success ? 1 : 0),
        } as unknown as Json,
      })
      .eq('id', conn.id)
  } catch {
    // Non-blocking metadata update
  }

  return {
    success: ingestResult.success,
    leadId: ingestResult.leadId,
    isDuplicate: ingestResult.isDuplicate,
    processingStatus: ingestResult.isDuplicate
      ? 'duplicate'
      : ingestResult.routingStatus === 'unmapped'
      ? 'unmapped'
      : 'processed',
    error: ingestResult.errorMessage,
  }
}
