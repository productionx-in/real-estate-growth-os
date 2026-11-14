// app/api/webhooks/whatsapp/route.ts
// Central Webhook Receiver for Meta WhatsApp Business Cloud API.
// Handles multi-tenant routing by matching incoming WABA ID or Phone Number ID to connected integrations.

import { NextRequest, NextResponse } from 'next/server'
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

  const expectedToken =
    process.env.META_WEBHOOK_VERIFY_TOKEN ||
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN ||
    'productionx_central_whatsapp_verify_token'

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
  if (appSecret) {
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

  // 5. Multi-Tenant Connection Resolution
  const service = createServiceClient()
  const { data: connections } = await service
    .from('integration_connections')
    .select('id, org_id, status, provider, metadata')
    .eq('provider', 'whatsapp_cloud')
    .eq('status', 'connected')

  const activeConnections = connections || []
  if (activeConnections.length === 0) {
    return NextResponse.json({ error: 'No active WhatsApp integrations found' }, { status: 404 })
  }

  // Group events by target connection
  const results = []
  for (const conn of activeConnections) {
    const meta = (conn.metadata || {}) as Record<string, unknown>
    const wabaId = meta.wabaId as string | undefined
    const selectedPhone = meta.selectedPhoneNumberId as string | undefined

    // Check if any entry matches this connection
    const matchingEntries = payload.entry?.filter((entry) => {
      if (wabaId && entry.id === wabaId) return true
      const hasPhone = entry.changes?.some(
        (c) => c.value?.metadata?.phone_number_id === selectedPhone
      )
      return hasPhone
    })

    if (matchingEntries && matchingEntries.length > 0) {
      const filteredPayload: WhatsAppWebhookPayload = {
        object: payload.object,
        entry: matchingEntries,
      }
      const summary = await processWhatsAppWebhookPayload({
        connectionId: conn.id,
        payload: filteredPayload,
        customServiceClient: service,
      })
      results.push({ connectionId: conn.id, summary })
    }
  }

  // If no specific match, default to first active connection if available
  if (results.length === 0 && activeConnections.length > 0) {
    const summary = await processWhatsAppWebhookPayload({
      connectionId: activeConnections[0].id,
      payload,
      customServiceClient: service,
    })
    results.push({ connectionId: activeConnections[0].id, summary })
  }

  return NextResponse.json({
    success: true,
    results,
  })
}
