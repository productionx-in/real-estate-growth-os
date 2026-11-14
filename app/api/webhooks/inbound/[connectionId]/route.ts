// app/api/webhooks/inbound/[connectionId]/route.ts
// Generic Public Webhook Receiver for inbound lead capture (landing pages, forms, third-party systems).
// Enforces connection-specific HMAC-SHA256 signatures, timestamp anti-replay verification,
// distributed atomic rate limiting across Vercel serverless instances, payload sanitization,
// secret rotation grace windows, tenant isolation, and idempotent CRM lead ingestion.

import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  validateWebhookSignature,
  checkDistributedRateLimit,
  MAX_WEBHOOK_PAYLOAD_BYTES,
  type WebhookSecretConfig,
} from '@/lib/integrations/webhooks/validator'
import { normalizeGenericWebhookPayload } from '@/lib/integrations/webhooks/normalizer'
import { processInboundLead } from '@/lib/integrations/inbound'
import { decryptCredential } from '@/lib/integrations/crypto'

interface RouteContext {
  params: Promise<{ connectionId: string }>
}

/**
 * Health check / verification endpoint for third-party webhook configurations.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const { connectionId } = await params
  if (!connectionId) {
    return NextResponse.json({ error: 'Connection ID is required' }, { status: 400 })
  }

  const service = createServiceClient()
  const { data: conn } = await service
    .from('integration_connections')
    .select('id, provider, status')
    .eq('id', connectionId)
    .maybeSingle()

  if (!conn) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  }

  return NextResponse.json({
    status: conn.status === 'connected' ? 'active' : conn.status,
    provider: conn.provider,
    endpoint: 'inbound_webhook',
  })
}

/**
 * Primary ingestion handler for inbound webhooks.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const { connectionId } = await params
  if (!connectionId) {
    return NextResponse.json({ success: false, error: 'Connection ID is required' }, { status: 400 })
  }

  // 1. Distributed Atomic Rate Limiting Check (per connection, synchronized across Vercel serverless instances)
  const rateLimit = await checkDistributedRateLimit({
    key: `webhook:conn:${connectionId}`,
    limit: 60,
    windowMs: 60_000,
  })

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: 'Rate limit exceeded. Too many webhook requests.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.max(1, Math.ceil(rateLimit.resetMs / 1000))),
          'X-RateLimit-Limit': '60',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.ceil(Date.now() / 1000 + rateLimit.resetMs / 1000)),
        },
      }
    )
  }

  // 2. Payload Size Check
  const contentLength = request.headers.get('content-length')
  if (contentLength && parseInt(contentLength, 10) > MAX_WEBHOOK_PAYLOAD_BYTES) {
    return NextResponse.json(
      { success: false, error: 'Payload size exceeds 1 MB limit' },
      { status: 413 }
    )
  }

  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Failed to read request body' },
      { status: 400 }
    )
  }

  if (Buffer.byteLength(rawBody, 'utf8') > MAX_WEBHOOK_PAYLOAD_BYTES) {
    return NextResponse.json(
      { success: false, error: 'Payload size exceeds 1 MB limit' },
      { status: 413 }
    )
  }

  const service = createServiceClient()

  // 3. Resolve Connection & Tenant Isolation
  const { data: connection, error: connError } = await service
    .from('integration_connections')
    .select('id, org_id, provider, name, status, credential_ref, metadata')
    .eq('id', connectionId)
    .maybeSingle()

  if (connError || !connection) {
    return NextResponse.json(
      { success: false, error: 'Integration connection not found' },
      { status: 404 }
    )
  }

  // 4. Inactive / Disabled Connection Gating
  if (connection.status !== 'connected') {
    await service.from('integration_event_logs').insert({
      org_id: connection.org_id,
      connection_id: connection.id,
      provider: connection.provider,
      event_type: 'webhook_rejected',
      processing_status: 'failed',
      error_message: `Connection status is '${connection.status}'. Inbound leads are blocked for inactive connections.`,
    })

    return NextResponse.json(
      {
        success: false,
        error: `Connection is ${connection.status}. Webhooks cannot be accepted for inactive connections.`,
      },
      { status: 403 }
    )
  }

  // 5. Decrypt Active Secret and Unexpired Previous Secret (for seamless secret rotation)
  let activeSecret: string | null = null
  if (connection.credential_ref) {
    try {
      activeSecret = decryptCredential(connection.credential_ref)
    } catch {
      // credential_ref might be a KMS or external reference format
    }
  }

  const meta = (connection.metadata || {}) as Record<string, unknown>
  if (!activeSecret) {
    if (meta.webhook_secret && typeof meta.webhook_secret === 'string') {
      activeSecret = meta.webhook_secret
    } else if (meta.encrypted_webhook_secret && typeof meta.encrypted_webhook_secret === 'string') {
      try {
        activeSecret = decryptCredential(meta.encrypted_webhook_secret)
      } catch {
        // failed decryption
      }
    }
  }

  if (!activeSecret) {
    await service.from('integration_event_logs').insert({
      org_id: connection.org_id,
      connection_id: connection.id,
      provider: connection.provider,
      event_type: 'webhook_misconfigured',
      processing_status: 'failed',
      error_message: 'Webhook signing secret is missing or misconfigured on the server.',
    })

    return NextResponse.json(
      { success: false, error: 'Webhook signing secret is not configured for this connection' },
      { status: 500 }
    )
  }

  let previousSecret: string | null = null
  let previousSecretExpiresAt: string | null = null
  if (meta.previous_credential_ref && typeof meta.previous_credential_ref === 'string') {
    try {
      previousSecret = decryptCredential(meta.previous_credential_ref)
      previousSecretExpiresAt = typeof meta.previous_secret_expires_at === 'string' ? meta.previous_secret_expires_at : null
    } catch {
      // ignore
    }
  }

  const secretConfig: WebhookSecretConfig = {
    activeSecret,
    previousSecret,
    previousSecretExpiresAt,
  }

  // 6. Verify HMAC-SHA256 Signature and Freshness against exact rawBody
  const signatureHeader =
    request.headers.get('x-webhook-signature') ||
    request.headers.get('x-signature-256') ||
    request.headers.get('x-hub-signature-256')

  const timestampHeader =
    request.headers.get('x-webhook-timestamp') ||
    request.headers.get('x-timestamp')

  const validation = validateWebhookSignature({
    rawBody,
    signatureHeader,
    timestampHeader,
    secret: secretConfig,
  })

  if (!validation.valid) {
    await service.from('integration_event_logs').insert({
      org_id: connection.org_id,
      connection_id: connection.id,
      provider: connection.provider,
      event_type: 'webhook_signature_failed',
      processing_status: 'failed',
      error_message: validation.error ?? 'Invalid signature or timestamp skew',
    })

    return NextResponse.json(
      { success: false, error: validation.error ?? 'Invalid webhook signature' },
      { status: 401 }
    )
  }

  // Log in-flight rotation acceptance if verified against previous secret
  if (validation.usedPreviousSecret) {
    await service.from('integration_event_logs').insert({
      org_id: connection.org_id,
      connection_id: connection.id,
      provider: connection.provider,
      event_type: 'webhook_in_flight_rotated_secret_accepted',
      processing_status: 'received',
      error_message: 'Webhook accepted using unexpired previous secret during rotation grace period',
    })
  }

  // 7. Parse Payload
  let parsedPayload: Record<string, unknown>
  try {
    parsedPayload = JSON.parse(rawBody)
    if (typeof parsedPayload !== 'object' || parsedPayload === null || Array.isArray(parsedPayload)) {
      throw new Error('Payload root must be a JSON object')
    }
  } catch (jsonErr: unknown) {
    const errMsg = jsonErr instanceof Error ? jsonErr.message : 'Invalid JSON'
    await service.from('integration_event_logs').insert({
      org_id: connection.org_id,
      connection_id: connection.id,
      provider: connection.provider,
      event_type: 'webhook_malformed_json',
      processing_status: 'failed',
      error_message: `JSON parse error: ${errMsg}`,
    })

    return NextResponse.json(
      { success: false, error: `Malformed JSON payload: ${errMsg}` },
      { status: 400 }
    )
  }

  // 8. Normalize Payload (Strictly Discards Tenant Spoofing Keys)
  const normalized = normalizeGenericWebhookPayload(parsedPayload, {
    connectionId: connection.id,
    provider: connection.provider,
  })

  // 9. Dispatch to Central CRM Inbound Engine
  try {
    const result = await processInboundLead(connection.org_id, normalized, {
      customClient: service,
    })

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.errorMessage ?? 'Failed to ingest lead',
          action: result.action,
          routingStatus: result.routingStatus,
        },
        { status: result.action === 'error' && result.errorMessage?.includes('valid phone') ? 422 : 400 }
      )
    }

    // 10. Sanitized Success Response (Zero Lead PII or Secrets Leaked)
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
  } catch (processErr: unknown) {
    const errMsg = processErr instanceof Error ? processErr.message : 'Processing error'
    console.error(`[Inbound Webhook Error] Connection ${connectionId}:`, processErr)

    await service.from('integration_event_logs').insert({
      org_id: connection.org_id,
      connection_id: connection.id,
      provider: connection.provider,
      event_type: 'lead_ingest_unexpected_error',
      processing_status: 'failed',
      error_message: errMsg,
    })

    return NextResponse.json(
      { success: false, error: 'Internal error processing inbound lead' },
      { status: 500 }
    )
  }
}
