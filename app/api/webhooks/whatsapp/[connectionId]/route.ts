// app/api/webhooks/whatsapp/[connectionId]/route.ts
// Connection-specific webhook receiver for Meta WhatsApp Business Cloud API.
// Validates GET challenges, verifies POST HMAC-SHA256 signatures against exact raw bytes,
// and orchestrates Click-to-WhatsApp referral attribution and lead ingestion.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { checkDistributedRateLimit } from '@/lib/integrations/webhooks/rate-limiter'
import {
  verifyWhatsAppWebhookChallenge,
  verifyWhatsAppWebhookSignature,
} from '@/lib/integrations/whatsapp/validator'
import { processWhatsAppWebhookPayload } from '@/lib/integrations/whatsapp/processor'
import type { WhatsAppWebhookPayload } from '@/lib/integrations/whatsapp/types'

interface RouteParams {
  params: Promise<{ connectionId: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { connectionId } = await params
  const { searchParams } = new URL(request.url)

  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const service = createServiceClient()
  const { data: connection } = await service
    .from('integration_connections')
    .select('id, org_id, status, provider, metadata')
    .eq('id', connectionId)
    .maybeSingle()

  if (!connection || connection.status !== 'connected' || connection.provider !== 'whatsapp_cloud') {
    return new NextResponse('Unauthorized connection or invalid provider', { status: 403 })
  }

  const meta = (connection.metadata || {}) as Record<string, unknown>
  const expectedToken =
    (meta.webhookVerifyToken as string) ||
    process.env.META_WEBHOOK_VERIFY_TOKEN ||
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
    'productionx_whatsapp_verify_token'

  const check = verifyWhatsAppWebhookChallenge({
    mode,
    token,
    challenge,
    expectedToken,
  })

  if (check.isValid && check.challenge) {
    return new NextResponse(check.challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  return new NextResponse('Forbidden verification token', { status: 403 })
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { connectionId } = await params

  // 1. Distributed Rate Limiting (120 requests/minute per connection)
  const rateLimit = await checkDistributedRateLimit({
    key: `webhook:whatsapp:${connectionId}`,
    limit: 120,
    windowMs: 60_000,
  })

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please retry later.' },
      { status: 429 }
    )
  }

  // 2. Read Exact Raw Body Bytes for HMAC Signature Verification
  const rawBody = await request.text()
  if (!rawBody || !rawBody.trim()) {
    return NextResponse.json({ error: 'Empty payload' }, { status: 400 })
  }

  // 3. Verify Connection Record
  const service = createServiceClient()
  const { data: connection } = await service
    .from('integration_connections')
    .select('id, org_id, status, provider, metadata')
    .eq('id', connectionId)
    .maybeSingle()

  if (!connection) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
  }

  if (connection.status !== 'connected') {
    return NextResponse.json(
      { error: `Connection is ${connection.status}. Webhooks blocked.` },
      { status: 400 }
    )
  }

  // 4. Verify HMAC-SHA256 Signature Header
  const signatureHeader = request.headers.get('x-hub-signature-256')
  const meta = (connection.metadata || {}) as Record<string, unknown>
  const appSecret =
    (meta.appSecret as string) ||
    process.env.META_APP_SECRET ||
    process.env.WHATSAPP_APP_SECRET

  // Fail closed: without the app secret nobody can tell Meta's posts from forged ones, and forged
  // "buyer messages" would land in the inbox. Configure META_APP_SECRET (or the connection's appSecret).
  if (!appSecret) {
    return NextResponse.json({ error: 'WhatsApp webhook signing secret is not configured.' }, { status: 503 })
  }
  {
    const isSigValid = verifyWhatsAppWebhookSignature({
      rawBody,
      signatureHeader,
      appSecret,
    })

    if (!isSigValid) {
      return NextResponse.json(
        { error: 'Invalid HMAC-SHA256 webhook signature' },
        { status: 401 }
      )
    }
  }

  // 5. Parse Payload & Ingest Events
  let payload: WhatsAppWebhookPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 })
  }

  const summary = await processWhatsAppWebhookPayload({
    connectionId: connection.id,
    payload,
    customServiceClient: service,
  })

  return NextResponse.json({
    success: true,
    processedMessages: summary.processedMessages,
    processedStatuses: summary.processedStatuses,
    optOutEvents: summary.optOutEvents,
    errors: summary.errors.length > 0 ? summary.errors : undefined,
  })
}
