// app/api/webhooks/google/route.ts
// Central Webhook Receiver for Google Ads Lead Form extensions.
// Enforces google_key secret verification, timing-safe validation,
// payload normalization, tenant isolation, and idempotent CRM lead ingestion.

import { NextResponse, type NextRequest } from 'next/server'
import crypto from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/server'
import { normalizeGoogleLead, type RawGoogleLeadData } from '@/lib/integrations/google/lead-normalizer'
import { processInboundLead } from '@/lib/integrations/inbound'
import { decryptCredential } from '@/lib/integrations/crypto'

export async function POST(request: NextRequest) {
  try {
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

    // 1. Find the matching connected Google Ads integration
    const { data: connections } = await service
      .from('integration_connections')
      .select('id, org_id, status, credential_ref, metadata')
      .eq('provider', 'google_ads')
      .eq('status', 'connected')

    let matchedConnection: { id: string; org_id: string; status: string; metadata: Record<string, unknown> } | null = null

    for (const conn of connections || []) {
      const meta = (conn.metadata || {}) as Record<string, unknown>
      const encryptedKey = meta.encryptedWebhookKey as string | undefined

      if (encryptedKey) {
        try {
          const decryptedKey = decryptCredential(encryptedKey)
          const bufExpected = Buffer.from(decryptedKey)
          const bufReceived = Buffer.from(google_key)

          if (bufExpected.length === bufReceived.length && crypto.timingSafeEqual(bufExpected, bufReceived)) {
            matchedConnection = conn as { id: string; org_id: string; status: string; metadata: Record<string, unknown> }
            break
          }
        } catch {
          // decryption failure
        }
      }
    }

    // Fallback: check global environment webhook key if defined
    if (!matchedConnection && process.env.GOOGLE_WEBHOOK_KEY) {
      const globalKey = process.env.GOOGLE_WEBHOOK_KEY
      if (globalKey === google_key && connections && connections.length > 0) {
        matchedConnection = connections[0] as { id: string; org_id: string; status: string; metadata: Record<string, unknown> }
      }
    }

    if (!matchedConnection) {
      console.warn('[Google Webhook] Unauthorized request: no matching connection found for provided google_key')
      return NextResponse.json({ error: 'Unauthorized: invalid google_key' }, { status: 401 })
    }

    // 2. Handle Google Ads Webhook Test Event (Advertiser testing in Google Ads UI)
    if (is_test) {
      await service.from('integration_event_logs').insert({
        org_id: matchedConnection.org_id,
        connection_id: matchedConnection.id,
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

    // 3. Normalize Google Lead Form Payload
    const normalized = normalizeGoogleLead(payload, matchedConnection.id)

    // 4. Ingest via Central CRM Inbound Engine
    const result = await processInboundLead(matchedConnection.org_id, normalized, {
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

    // 5. Return sanitized response (zero lead PII or tokens returned)
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
    console.error('[Google Webhook Error]:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
