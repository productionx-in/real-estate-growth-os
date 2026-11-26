// lib/integrations/forms/ingest.ts
// The one pipeline for enquiries that arrive from public websites — the hosted enquiry form
// (/api/forms/submit) and the website capture script (/api/capture):
//   1. rate limits (per network, per connection)        4. the website's domain is on the allow list
//   2. spam checks (honeypot, speed, link injection)      5. normalise and ingest through the CRM pipeline
//   3. the connection exists, is a website connection and is switched on
// The capture script runs on a customer's own pages and picks up their existing forms, so it is held to a
// stricter rule: it only works for domains the customer has listed.
import { createServiceClient } from '@/lib/supabase/server'
import { checkDistributedRateLimit } from '@/lib/integrations/webhooks/rate-limiter'
import { evaluateSpamSubmission } from '@/lib/integrations/forms/spam-defense'
import { normalizeWebsiteEnquiry } from '@/lib/integrations/forms/normalizer'
import { processInboundLead } from '@/lib/integrations/inbound'
import type { EnquirySubmissionInput } from '@/lib/integrations/forms/types'
import type { Touch } from '@/lib/integrations/website/attribution'

export type IngestMode = 'form' | 'capture'

export interface IngestContext {
  /** Origin (or Referer) header of the request. */
  origin: string | null
  clientIp: string
  mode: IngestMode
  /** Capture only: first and latest visit details, already cleaned (lib/integrations/website/attribution). */
  attribution?: { first: Touch | null; last: Touch | null; pages: number | null; pageTitle: string | null; adPlatform: string | null }
}

export interface IngestResult {
  status: number
  body: { success: boolean; message?: string; error?: string }
}

const THANKS = 'Thank you for your enquiry. Our team will contact you shortly.'

/** Validates request origin or referer against connection allowed domains list. */
export function isDomainAllowed(originOrReferer: string | null, allowedDomains?: string[]): boolean {
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

export async function ingestWebsiteEnquiry(body: EnquirySubmissionInput, ctx: IngestContext): Promise<IngestResult> {
  // 1. IP-level rate limit (15 requests per 5 minutes per IP)
  const ipRateLimit = await checkDistributedRateLimit({ key: `form:ip:${ctx.clientIp}`, limit: 15, windowMs: 300_000 })
  if (!ipRateLimit.allowed) {
    return { status: 429, body: { success: false, error: 'Too many submissions from this network. Please try again later.' } }
  }

  const connectionId = body.connectionId ? String(body.connectionId).trim() : null
  if (!connectionId) return { status: 400, body: { success: false, error: 'Missing required connectionId.' } }

  const name = body.name ? String(body.name).trim() : ''
  const phone = body.phone ? String(body.phone).trim() : ''
  const email = body.email ? String(body.email).trim() : ''
  if (!name || (!phone && !email)) {
    return { status: 400, body: { success: false, error: 'Name and at least one contact method (phone or email) are required.' } }
  }

  // Connection-level rate limit (120 requests per minute per connection)
  const connRateLimit = await checkDistributedRateLimit({ key: `form:conn:${connectionId}`, limit: 120, windowMs: 60_000 })
  if (!connRateLimit.allowed) {
    return { status: 429, body: { success: false, error: 'Rate limit exceeded for this form. Please try again shortly.' } }
  }

  const service = createServiceClient()

  // 2. Spam: recorded for the operator, answered as a success so bots learn nothing.
  const spamResult = evaluateSpamSubmission(body)
  if (spamResult.isSpam) {
    try {
      const { data: conn } = await service.from('integration_connections').select('org_id').eq('id', connectionId).maybeSingle()
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
    return { status: 200, body: { success: true, message: THANKS } }
  }

  // 3. The connection
  const { data: connection, error: connError } = await service
    .from('integration_connections')
    .select('id, org_id, status, provider, metadata')
    .eq('id', connectionId)
    .maybeSingle()
  if (connError || !connection) return { status: 404, body: { success: false, error: 'Integration connection not found.' } }
  if (connection.status !== 'connected') {
    return { status: 400, body: { success: false, error: `Enquiry form is inactive (status: ${connection.status}). Submissions are disabled.` } }
  }
  if (connection.provider !== 'website_webhook') {
    return { status: 400, body: { success: false, error: 'Invalid integration connection provider for website enquiry form.' } }
  }

  // 4. The website's domain
  const meta = (connection.metadata || {}) as Record<string, unknown>
  const allowedDomains = Array.isArray(meta.allowedDomains) ? (meta.allowedDomains as string[]).filter((d) => typeof d === 'string' && d.trim()) : []
  if (ctx.mode === 'capture' && allowedDomains.length === 0) {
    return { status: 403, body: { success: false, error: 'Add this website’s domain in RE by PX (Integrations → Website) before capturing its forms.' } }
  }
  if (allowedDomains.length > 0 && !isDomainAllowed(ctx.origin, allowedDomains)) {
    return { status: 403, body: { success: false, error: 'Submissions from this website domain are not authorized for this enquiry form.' } }
  }

  // 5. Normalise and ingest
  try {
    const normalizedPayload = normalizeWebsiteEnquiry(body, { connectionId: connection.id })
    if (ctx.mode === 'capture' && ctx.attribution) {
      const { first, last, pages, pageTitle, adPlatform } = ctx.attribution
      normalizedPayload.sourceMetadata = {
        ...normalizedPayload.sourceMetadata,
        ingested_via: 'website_capture',
        first_touch: first,
        last_touch: last,
        pages_viewed: pages,
        page_title: pageTitle,
        ad_platform: adPlatform,
      }
    }
    const result = await processInboundLead(connection.org_id, normalizedPayload, { customClient: service })
    if (!result.success && result.action === 'error') {
      return { status: 400, body: { success: false, error: result.errorMessage || 'Unable to process enquiry at this time.' } }
    }
    // Never leak internal lead, organisation or tenant identifiers.
    return { status: 200, body: { success: true, message: THANKS } }
  } catch (err) {
    console.error('[WebsiteEnquiry] Unexpected error during lead ingestion:', err)
    return { status: 500, body: { success: false, error: 'An unexpected error occurred. Please try again later.' } }
  }
}
