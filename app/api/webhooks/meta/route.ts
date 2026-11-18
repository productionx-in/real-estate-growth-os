// app/api/webhooks/meta/route.ts
// Official Meta Webhook endpoint for Meta Lead Ads real-time event streaming.
// Handles GET verification challenge and POST real-time lead event processing.
// Enforces X-Hub-Signature-256 HMAC verification, decrypted token retrieval,
// Graph API lead fetching, and idempotent central CRM ingestion.

import { NextResponse, type NextRequest } from 'next/server'
import crypto from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/server'
import { getMetaAppConfig } from '@/lib/integrations/meta/config'
import { fetchMetaLead } from '@/lib/integrations/meta/client'
import { normalizeMetaLead } from '@/lib/integrations/meta/lead-normalizer'
import { processInboundLead } from '@/lib/integrations/inbound'
import { decryptCredential } from '@/lib/integrations/crypto'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  const config = getMetaAppConfig()

  if (mode === 'subscribe' && token && config.webhookVerifyToken && token === config.webhookVerifyToken) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  }

  return NextResponse.json({ error: 'Verification token mismatch or invalid mode' }, { status: 403 })
}

export async function POST(request: NextRequest) {
  // Timing starts when the webhook arrives: Meta's lead fetch below counts toward "receipt → saved".
  const receivedAt = new Date()
  try {
    const rawBody = await request.text()
    const signature = request.headers.get('x-hub-signature-256')

    const config = getMetaAppConfig()
    if (!config.appSecret) {
      console.error('[Meta Webhook] META_APP_SECRET is not configured on server')
      return NextResponse.json({ error: 'Server webhook configuration incomplete' }, { status: 500 })
    }

    // 1. Verify HMAC-SHA256 signature
    if (!signature || !signature.startsWith('sha256=')) {
      return NextResponse.json({ error: 'Missing or malformed X-Hub-Signature-256' }, { status: 401 })
    }

    const expectedSignature = `sha256=${crypto
      .createHmac('sha256', config.appSecret)
      .update(rawBody, 'utf8')
      .digest('hex')}`

    const sigBuf = Buffer.from(signature)
    const expectedBuf = Buffer.from(expectedSignature)

    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      console.warn('[Meta Webhook] Invalid X-Hub-Signature-256: rejecting unverified webhook')
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
    }

    // 2. Parse payload
    const payload = JSON.parse(rawBody)
    if (payload.object !== 'page' || !Array.isArray(payload.entry)) {
      // Return 200 to acknowledge non-leadgen events safely
      return NextResponse.json({ received: true, ignored: true }, { status: 200 })
    }

    const service = createServiceClient()

    // 3. Process entries
    for (const entry of payload.entry) {
      const pageId = entry.id
      const changes = Array.isArray(entry.changes) ? entry.changes : []

      for (const change of changes) {
        if (change.field !== 'leadgen' || !change.value) continue

        const { leadgen_id, page_id } = change.value
        const targetPageId = page_id || pageId

        if (!leadgen_id) continue

        // Find connected integration for this page
        const { data: connections } = await service
          .from('integration_connections')
          .select('id, org_id, status, metadata')
          .eq('provider', 'meta_ads')
          .eq('status', 'connected')

        const matchedConn = (connections || []).find((c) => {
          const meta = (c.metadata || {}) as Record<string, unknown>
          const encryptedTokens = (meta.encryptedPageTokens || {}) as Record<string, string>
          return Boolean(encryptedTokens[targetPageId])
        })

        if (!matchedConn) {
          console.warn(`[Meta Webhook] No active connection found for page ${targetPageId}`)
          continue
        }

        const metadata = (matchedConn.metadata || {}) as Record<string, unknown>
        const encryptedTokens = (metadata.encryptedPageTokens || {}) as Record<string, string>
        const encryptedToken = encryptedTokens[targetPageId]

        if (!encryptedToken) continue

        try {
          const pageAccessToken = decryptCredential(encryptedToken)
          const leadData = await fetchMetaLead(leadgen_id, pageAccessToken)
          const normalizedPayload = normalizeMetaLead(leadData, matchedConn.id)

          // Dispatch to central inbound engine with tenant isolation & deduplication
          await processInboundLead(matchedConn.org_id, normalizedPayload, {
            customClient: service,
            receivedAt,
          })
        } catch (leadErr) {
          console.error(`[Meta Webhook] Failed to fetch or ingest lead ${leadgen_id}:`, leadErr)
          // Log failure in integration_event_logs
          await service.from('integration_event_logs').insert({
            org_id: matchedConn.org_id,
            connection_id: matchedConn.id,
            provider: 'meta_ads',
            event_type: 'lead_retrieval_failed',
            processing_status: 'failed',
            external_event_id: leadgen_id,
            error_message: leadErr instanceof Error ? leadErr.message : 'Unknown lead retrieval error',
          })
        }
      }
    }

    return NextResponse.json({ success: true, received: true }, { status: 200 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    console.error('[Meta Webhook Handler Error]:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
