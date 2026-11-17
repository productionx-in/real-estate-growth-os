// app/api/capture/route.ts
// Receives enquiries picked up by the website capture script (/capture.js) from a customer's own forms.
// The script sends text/plain JSON (navigator.sendBeacon), so no CORS preflight is needed and the visitor's
// page is never held up. Only the fields below are read; anything else the page sends is ignored.
// Checks are shared with the hosted form (lib/integrations/forms/ingest.ts); capture additionally requires
// the website's domain to be on the connection's allow list.
import { NextRequest, NextResponse } from 'next/server'
import { ingestWebsiteEnquiry } from '@/lib/integrations/forms/ingest'
import { adPlatform, cleanText, cleanTouch, safeHttpUrl } from '@/lib/integrations/website/attribution'
import type { EnquirySubmissionInput } from '@/lib/integrations/forms/types'

const MAX_BODY = 16 * 1024
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function cors(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: cors(request.headers.get('origin')) })
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin') || request.headers.get('referer')
  const headers = cors(request.headers.get('origin'))
  const clientIp =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown-client'

  const text = await request.text().catch(() => '')
  if (!text || text.length > MAX_BODY) {
    return NextResponse.json({ success: false, error: 'Invalid capture payload.' }, { status: 400, headers })
  }
  let raw: Record<string, unknown>
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
    raw = parsed
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid capture payload.' }, { status: 400, headers })
  }

  const key = typeof raw.key === 'string' && UUID.test(raw.key) ? raw.key : null
  if (!key) return NextResponse.json({ success: false, error: 'Missing website key.' }, { status: 400, headers })

  const phone = cleanText(raw.phone, 40)
  const email = cleanText(raw.email, 200)
  const first = cleanTouch(raw.first)
  const last = cleanTouch(raw.last) ?? first
  // Measured on the visitor's device (time from first touching the form to sending), so clock differences
  // between their device and our server cannot make a person look like a bot or the reverse.
  const fillMs = typeof raw.fillMs === 'number' && Number.isFinite(raw.fillMs) && raw.fillMs >= 0 ? Math.min(raw.fillMs, 86_400_000) : null

  const input: EnquirySubmissionInput = {
    connectionId: key,
    // Many site forms ask only for a phone number; the lead still needs a name.
    name: cleanText(raw.name, 120) ?? (phone || email ? 'Website visitor' : ''),
    phone: phone ?? '',
    email,
    notes: cleanText(raw.notes, 1000),
    budget: cleanText(raw.budget, 100),
    unitPreference: cleanText(raw.unit, 100),
    formId: cleanText(raw.formId, 100),
    projectId: typeof raw.projectId === 'string' && UUID.test(raw.projectId) ? raw.projectId : null,
    pageUrl: safeHttpUrl(raw.pageUrl),
    referrer: last?.referrer ?? null,
    utmSource: last?.utm_source ?? null,
    utmMedium: last?.utm_medium ?? null,
    utmCampaign: last?.utm_campaign ?? null,
    utmTerm: last?.utm_term ?? null,
    utmContent: last?.utm_content ?? null,
    idempotencyToken: typeof raw.token === 'string' && UUID.test(raw.token) ? raw.token : null,
    hpConfirm: raw.hp === '1' ? 'filled' : null,
    formLoadTime: fillMs !== null ? Date.now() - fillMs : null,
  }

  const result = await ingestWebsiteEnquiry(input, {
    origin,
    clientIp,
    mode: 'capture',
    attribution: {
      first,
      last,
      pages: typeof raw.pages === 'number' && Number.isFinite(raw.pages) ? Math.max(1, Math.min(10_000, Math.floor(raw.pages))) : null,
      pageTitle: cleanText(raw.pageTitle, 200),
      adPlatform: adPlatform(last) ?? adPlatform(first),
    },
  })
  return NextResponse.json(result.body, { status: result.status, headers })
}
