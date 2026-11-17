// app/api/forms/submit/route.ts
// Public endpoint for the hosted website enquiry form (embed widget, iframe, or a developer's own fetch).
// The checks — rate limits, spam, connection, allowed domains — live in lib/integrations/forms/ingest.ts,
// shared with the website capture script (/api/capture).
import { NextRequest, NextResponse } from 'next/server'
import { ingestWebsiteEnquiry } from '@/lib/integrations/forms/ingest'
import type { EnquirySubmissionInput } from '@/lib/integrations/forms/types'

function getCorsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Max-Age': '86400',
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(request.headers.get('origin')) })
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin') || request.headers.get('referer')
  const corsHeaders = getCorsHeaders(origin)
  const clientIp =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown-client'

  let body: EnquirySubmissionInput
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON request body.' }, { status: 400, headers: corsHeaders })
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ success: false, error: 'Request body must be a JSON object.' }, { status: 400, headers: corsHeaders })
  }

  const result = await ingestWebsiteEnquiry(body, { origin, clientIp, mode: 'form' })
  return NextResponse.json(result.body, { status: result.status, headers: corsHeaders })
}
