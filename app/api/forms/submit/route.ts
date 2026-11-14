// app/api/forms/submit/route.ts
// Public REST API endpoint for receiving website enquiry form submissions.
// Enforces distributed rate limiting, honeypot & time-to-fill anti-spam checks,
// allowed origin domain verification, connection-level status checks, and central CRM lead ingestion.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { checkDistributedRateLimit } from '@/lib/integrations/webhooks/rate-limiter'
import { evaluateSpamSubmission } from '@/lib/integrations/forms/spam-defense'
import { normalizeWebsiteEnquiry } from '@/lib/integrations/forms/normalizer'
import { processInboundLead } from '@/lib/integrations/inbound'
import type { EnquirySubmissionInput } from '@/lib/integrations/forms/types'

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Max-Age': '86400',
}

function getCorsHeaders(origin: string | null): Record<string, string> {
  return {
    ...CORS_HEADERS,
    'Access-Control-Allow-Origin': origin || '*',
  }
}

/**
 * Validates request origin or referer against connection allowed domains list.
 */
function isDomainAllowed(originOrReferer: string | null, allowedDomains?: string[]): boolean {
  if (!allowedDomains || allowedDomains.length === 0) return true
  if (!originOrReferer) return false

  try {
    let hostname = originOrReferer
    if (hostname.startsWith('http://') || hostname.startsWith('https://')) {
      hostname = new URL(hostname).hostname
    }
    hostname = hostname.toLowerCase()

    return allowedDomains.some((d) => {
      const cleanD = d.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0]
      if (cleanD === '*' || hostname === cleanD) return true
      if (cleanD.startsWith('*.') && hostname.endsWith(cleanD.slice(1))) return true
      return false
    })
  } catch {
    return false
  }
}

export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin')
  return new NextResponse(null, {
    status: 204,
    headers: getCorsHeaders(origin),
  })
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin') || request.headers.get('referer')
  const corsHeaders = getCorsHeaders(origin)

  // 1. IP-Level Distributed Rate Limiting (15 requests per 5 minutes per IP)
  const clientIp =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown-client'

  const ipRateLimit = await checkDistributedRateLimit({
    key: `form:ip:${clientIp}`,
    limit: 15,
    windowMs: 300_000,
  })

  if (!ipRateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: 'Too many submissions from this network. Please try again later.' },
      { status: 429, headers: corsHeaders }
    )
  }

  // 2. Parse & Validate Inbound Body
  let body: EnquirySubmissionInput
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON request body.' },
      { status: 400, headers: corsHeaders }
    )
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { success: false, error: 'Request body must be a JSON object.' },
      { status: 400, headers: corsHeaders }
    )
  }

  const connectionId = body.connectionId ? String(body.connectionId).trim() : null
  if (!connectionId) {
    return NextResponse.json(
      { success: false, error: 'Missing required connectionId.' },
      { status: 400, headers: corsHeaders }
    )
  }

  const name = body.name ? String(body.name).trim() : ''
  const phone = body.phone ? String(body.phone).trim() : ''
  const email = body.email ? String(body.email).trim() : ''

  if (!name || (!phone && !email)) {
    return NextResponse.json(
      { success: false, error: 'Name and at least one contact method (phone or email) are required.' },
      { status: 400, headers: corsHeaders }
    )
  }

  // 3. Connection-Level Distributed Rate Limiting (120 requests per minute per connection)
  const connRateLimit = await checkDistributedRateLimit({
    key: `form:conn:${connectionId}`,
    limit: 120,
    windowMs: 60_000,
  })

  if (!connRateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: 'Rate limit exceeded for this form. Please try again shortly.' },
      { status: 429, headers: corsHeaders }
    )
  }

  // 4. Multi-Layer Anti-Spam Evaluation (Honeypot, Speed, Keyword Injection)
  const spamResult = evaluateSpamSubmission(body)
  if (spamResult.isSpam) {
    // Record spam detection in event log for operator observability
    try {
      const service = createServiceClient()
      const { data: conn } = await service
        .from('integration_connections')
        .select('org_id')
        .eq('id', connectionId)
        .maybeSingle()

      if (conn?.org_id) {
        await service.from('integration_event_logs').insert({
          org_id: conn.org_id,
          connection_id: connectionId,
          provider: 'website_webhook',
          event_type: 'spam_honeypot_triggered',
          processing_status: 'failed',
          error_message: spamResult.reason || 'Automated spam submission detected',
          received_at: new Date().toISOString(),
          processed_at: new Date().toISOString(),
        })
      }
    } catch {
      // Non-blocking log failure
    }

    // Silent sink: return 200 OK so bots do not learn or adapt their heuristics
    return NextResponse.json(
      {
        success: true,
        message: 'Thank you for your enquiry. Our team will contact you shortly.',
      },
      { status: 200, headers: corsHeaders }
    )
  }

  // 5. Verify Connection Record & Tenant Authority
  const service = createServiceClient()
  const { data: connection, error: connError } = await service
    .from('integration_connections')
    .select('id, org_id, status, provider, metadata')
    .eq('id', connectionId)
    .maybeSingle()

  if (connError || !connection) {
    return NextResponse.json(
      { success: false, error: 'Integration connection not found.' },
      { status: 404, headers: corsHeaders }
    )
  }

  if (connection.status !== 'connected') {
    return NextResponse.json(
      {
        success: false,
        error: `Enquiry form is inactive (status: ${connection.status}). Submissions are disabled.`,
      },
      { status: 400, headers: corsHeaders }
    )
  }

  if (connection.provider !== 'website_webhook') {
    return NextResponse.json(
      { success: false, error: 'Invalid integration connection provider for website enquiry form.' },
      { status: 400, headers: corsHeaders }
    )
  }

  // 6. Verify Allowed Origin Domain
  const meta = (connection.metadata || {}) as Record<string, unknown>
  const allowedDomains = Array.isArray(meta.allowedDomains)
    ? (meta.allowedDomains as string[])
    : undefined

  if (allowedDomains && allowedDomains.length > 0 && !isDomainAllowed(origin, allowedDomains)) {
    return NextResponse.json(
      {
        success: false,
        error: 'Submissions from this website domain are not authorized for this enquiry form.',
      },
      { status: 403, headers: corsHeaders }
    )
  }

  // 7. Normalize Lead & Ingest through Unified Central CRM Pipeline
  try {
    const normalizedPayload = normalizeWebsiteEnquiry(body, {
      connectionId: connection.id,
    })

    const result = await processInboundLead(connection.org_id, normalizedPayload, {
      customClient: service,
    })

    if (!result.success && result.action === 'error') {
      return NextResponse.json(
        {
          success: false,
          error: result.errorMessage || 'Unable to process enquiry at this time.',
        },
        { status: 400, headers: corsHeaders }
      )
    }

    // Return non-sensitive confirmation (never leak internal lead ID, org ID, or tenant data)
    return NextResponse.json(
      {
        success: true,
        message: 'Thank you for your enquiry. Our team will contact you shortly.',
      },
      { status: 200, headers: corsHeaders }
    )
  } catch (err) {
    console.error('[WebsiteFormSubmit] Unexpected error during lead ingestion:', err)
    return NextResponse.json(
      { success: false, error: 'An unexpected error occurred. Please try again later.' },
      { status: 500, headers: corsHeaders }
    )
  }
}
