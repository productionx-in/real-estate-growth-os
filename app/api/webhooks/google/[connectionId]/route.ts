// app/api/webhooks/google/[connectionId]/route.ts
// Connection-Specific Webhook Receiver for Google Ads Lead Form extensions.
// Enforces connection ownership, google_key authentication, tenant isolation,
// and central CRM idempotent lead ingestion.

import { NextResponse, type NextRequest } from 'next/server'
import crypto from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/server'
import { normalizeGoogleLead, type RawGoogleLeadData } from '@/lib/integrations/google/lead-normalizer'
import { processInboundLead } from '@/lib/integrations/inbound'
import { decryptCredential } from '@/lib/integrations/crypto'

interface RouteContext {
  params: Promise<{ connectionId: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { connectionId } = await params
    if (!connectionId) {
      return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 })
    }

    const rawBody = await request.text()
    if (!rawBody || !rawBody.trim()) {
      return NextResponse.json({ error: 'Empty request body' }, { status: 400 })
    }

    let payload: RawGoogleLeadData
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 })
    }

    const { google_key, lead_id, form_id, is_test } = payload

    if (!google_key) {
      return NextResponse.json({ error: 'Missing google_key in lead form payload' }, { status: 401 })
    }

    const service = createServiceClient()

    // 1. Fetch connection by ID
    const { data: connection } = await service
      .from('integration_connections')
      .select('id, org_id, provider, status, credential_ref, metadata')
      .eq('id', connectionId)
      .eq('provider', 'google_ads')
      .maybeSingle()

    if (!connection) {
      return NextResponse.json({ error: 'Google Ads connection not found' }, { status: 404 })
    }

    if (connection.status !== 'connected') {
      await service.from('integration_event_logs').insert({
        org_id: connection.org_id,
        connection_id: connection.id,
        provider: 'google_ads',
        event_type: 'webhook_rejected',
        processing_status: 'failed',
        error_message: `Connection is ${connection.status}. Webhooks are rejected for inactive connections.`,
      })

      return NextResponse.json(
        { error: `Connection is ${connection.status}. Webhooks cannot be processed.` },
        { status: 403 }
      )
    }

    // 2. Validate google_key secret
    const meta = (connection.metadata || {}) as Record<string, unknown>
    let expectedKey: string | null = null

    if (meta.encryptedWebhookKey && typeof meta.encryptedWebhookKey === 'string') {
      try {
        expectedKey = decryptCredential(meta.encryptedWebhookKey)
      } catch {
        // failed decryption
      }
    }

    if (!expectedKey && process.env.GOOGLE_WEBHOOK_KEY) {
      expectedKey = process.env.GOOGLE_WEBHOOK_KEY
    }

    if (!expectedKey) {
      return NextResponse.json(
        { error: 'Webhook key is not configured for this connection' },
        { status: 500 }
      )
    }

    const bufExpected = Buffer.from(expectedKey)
    const bufReceived = Buffer.from(google_key)

    if (bufExpected.length !== bufReceived.length || !crypto.timingSafeEqual(bufExpected, bufReceived)) {
      await service.from('integration_event_logs').insert({
        org_id: connection.org_id,
        connection_id: connection.id,
        provider: 'google_ads',
        event_type: 'webhook_signature_failed',
        processing_status: 'failed',
        error_message: 'Invalid google_key supplied in webhook payload.',
      })

      return NextResponse.json({ error: 'Unauthorized: invalid google_key' }, { status: 401 })
    }

    // 3. Handle Test Webhook Submission
    if (is_test) {
      await service.from('integration_event_logs').insert({
        org_id: connection.org_id,
        connection_id: connection.id,
        provider: 'google_ads',
        event_type: 'google_lead_test_verified',
        processing_status: 'processed',
        external_event_id: lead_id || `test_form_${form_id}`,
        error_message: 'Google Ads test webhook received and validated successfully.',
        processed_at: new Date().toISOString(),
      })

      return NextResponse.json({
        success: true,
        received: true,
        is_test: true,
        message: 'Google Ads test webhook verified successfully.',
      })
    }

    // 4. Normalize and Ingest Lead
    const normalized = normalizeGoogleLead(payload, connection.id)

    const result = await processInboundLead(connection.org_id, normalized, {
      customClient: service,
    })

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.errorMessage ?? 'Failed to ingest Google lead',
          action: result.action,
          routingStatus: result.routingStatus,
        },
        { status: result.action === 'error' && result.errorMessage?.includes('valid phone') ? 422 : 400 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        leadId: result.leadId ?? null,
        action: result.action,
        routingStatus: result.routingStatus,
        projectId: result.projectId ?? null,
        classification: result.classification ?? null,
      },
      { status: result.action === 'created' ? 201 : 200 }
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    console.error(`[Google Webhook Connection Error]:`, err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
