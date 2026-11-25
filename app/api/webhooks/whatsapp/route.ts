// app/api/webhooks/whatsapp/route.ts
// Central Webhook Receiver for Meta WhatsApp Business Cloud API.
// Handles multi-tenant routing by matching incoming WABA ID or Phone Number ID to connected integrations.

import { NextRequest, NextResponse } from 'next/server'
import { routeWebhookEntries } from '@/lib/integrations/whatsapp/numbers'
import { createServiceClient } from '@/lib/supabase/server'
import { checkDistributedRateLimit } from '@/lib/integrations/webhooks/rate-limiter'
import {
  verifyWhatsAppWebhookChallenge,
  verifyWhatsAppWebhookSignature,
} from '@/lib/integrations/whatsapp/validator'
import { processWhatsAppWebhookPayload } from '@/lib/integrations/whatsapp/processor'
import type { WhatsAppWebhookPayload } from '@/lib/integrations/whatsapp/types'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  // Fail closed: a fixed fallback would be public in this repository, letting anyone register this URL.
  const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
  if (!expectedToken) {
    return new NextResponse('WhatsApp webhook verify token is not configured.', { status: 503 })
  }

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

  return new NextResponse('Forbidden central verification token', { status: 403 })
}

export async function POST(request: NextRequest) {
  // 1. Central Rate Limiting
  const clientIp =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'meta-whatsapp'

  const rateLimit = await checkDistributedRateLimit({
    key: `webhook:whatsapp:central:${clientIp}`,
    limit: 300,
    windowMs: 60_000,
  })

  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  // 2. Read Raw Body
  const rawBody = await request.text()
  if (!rawBody || !rawBody.trim()) {
    return NextResponse.json({ error: 'Empty payload' }, { status: 400 })
  }

  // 3. Central Signature Verification
  const appSecret = process.env.META_APP_SECRET || process.env.WHATSAPP_APP_SECRET
  // Fail closed: without the app secret nobody can tell Meta's posts from forged ones, and forged
  // "buyer messages" would land in the inbox. Configure META_APP_SECRET (or the connection's appSecret).
  if (!appSecret) {
    return NextResponse.json({ error: 'WhatsApp webhook signing secret is not configured.' }, { status: 503 })
  }
  {
    const signatureHeader = request.headers.get('x-hub-signature-256')
    const isSigValid = verifyWhatsAppWebhookSignature({
      rawBody,
      signatureHeader,
      appSecret,
    })

    if (!isSigValid) {
      return NextResponse.json(
        { error: 'Invalid central HMAC-SHA256 signature' },
        { status: 401 }
      )
    }
  }

  // 4. Parse Payload
  let payload: WhatsAppWebhookPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 })
  }

  // 5. Multi-Tenant Connection Resolution: each change goes to the connection of the number it was sent to
  //    (lib/integrations/whatsapp/numbers.ts), so a workspace with several numbers gets each message once.
  const service = createServiceClient()
  const { data: connections } = await service
    .from('integration_connections')
    .select('id, org_id, status, provider, metadata, external_account_id')
    .eq('provider', 'whatsapp_cloud')
    .eq('status', 'connected')

  const activeConnections = (connections || []).map((c) => ({ ...c, metadata: (c.metadata || {}) as Record<string, unknown> }))
  if (activeConnections.length === 0) {
    // Signed by Meta but for no connected workspace: acknowledge so Meta does not retry and disable the webhook.
    return NextResponse.json({ success: true, results: [] })
  }

  const results = []
  for (const [connectionId, entries] of routeWebhookEntries(payload.entry ?? [], activeConnections)) {
    const filteredPayload: WhatsAppWebhookPayload = { object: payload.object, entry: entries }
    const summary = await processWhatsAppWebhookPayload({ connectionId, payload: filteredPayload, customServiceClient: service })
    results.push({ connectionId, summary })
  }

  // An event that matches no connection belongs to no workspace here: acknowledge it (so Meta does not retry
  // forever) and drop it. Never hand it to some other workspace's connection.
  return NextResponse.json({
    success: true,
    results,
  })
}
