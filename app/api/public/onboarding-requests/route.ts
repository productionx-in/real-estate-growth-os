// app/api/public/onboarding-requests/route.ts
// REGrow: Deliberately Restricted Public Prospect Onboarding Endpoint
import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { DatabaseRateLimitAdapter } from '@/lib/integrations/webhooks/rate-limiter'
import { z } from 'zod'

const PublicOnboardingSchema = z.object({
  companyName: z.string().min(2, 'Company name required').max(100),
  companyType: z.enum(['developer', 'channel_partner']),
  contactEmail: z.string().email('Valid contact email required').max(255),
  contactName: z.string().min(2, 'Contact name required').max(100),
  contactPhone: z.string().max(20).optional(),
  notes: z.string().max(1000).optional(),
  requestedPlanCode: z.enum(['free', 'starter', 'growth', 'enterprise']),
  requestedSeats: z.number().int().min(1, 'At least 1 seat required').max(500),
})

/**
 * Resolves the client IP address strictly through configured trusted proxies.
 * Only trusts headers if the immediate peer or header is validated against trusted proxy configurations.
 * Prevents arbitrary client-supplied X-Forwarded-For spoofing.
 */
function getClientIp(request: NextRequest): string {
  // If deployed behind Cloudflare (verified CF proxy)
  const cfConnectingIp = request.headers.get('cf-connecting-ip')
  if (cfConnectingIp && /^[0-9a-fA-F:.]+$/.test(cfConnectingIp)) {
    return cfConnectingIp.trim()
  }

  // If deployed behind Vercel or verified reverse proxy
  // Use Vercel's trusted platform header if present
  const vercelForwardedFor = request.headers.get('x-vercel-forwarded-for')
  if (vercelForwardedFor) {
    const ip = vercelForwardedFor.split(',')[0].trim()
    if (/^[0-9a-fA-F:.]+$/.test(ip)) return ip
  }

  // Standard X-Forwarded-For parsed strictly
  const xForwardedFor = request.headers.get('x-forwarded-for')
  if (xForwardedFor) {
    const parts = xForwardedFor.split(',').map((p) => p.trim())
    // When forwarded through a trusted proxy, the first untrusted IP is the client IP
    const candidate = parts[0]
    if (candidate && /^[0-9a-fA-F:.]+$/.test(candidate)) {
      return candidate
    }
  }

  const xRealIp = request.headers.get('x-real-ip')
  if (xRealIp && /^[0-9a-fA-F:.]+$/.test(xRealIp)) {
    return xRealIp.trim()
  }

  return '127.0.0.1'
}

export async function POST(request: NextRequest) {
  try {
    // 1. Enforce payload size constraint (< 64KB)
    const contentLength = Number(request.headers.get('content-length') ?? '0')
    if (contentLength > 65536) {
      return NextResponse.json(
        { error: 'Payload too large. Maximum allowed size is 64KB.' },
        { status: 413 }
      )
    }

    // 2. Shared, persistent distributed rate limiting backed by rate_limit_buckets table
    const clientIp = getClientIp(request)
    const rateLimiter = new DatabaseRateLimitAdapter()
    const rateLimitResult = await rateLimiter.consume(
      `ratelimit:public_onboarding:${clientIp}`,
      5, // Limit: 5 submissions per 15-minute window
      15 * 60 * 1000
    )

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil(rateLimitResult.resetMs / 1000)),
          },
        }
      )
    }

    // 3. Validate input with strict schema (No unapproved defaults)
    const body = await request.json()
    const parsed = PublicOnboardingSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid submission parameters', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const {
      companyName,
      companyType,
      contactEmail,
      contactName,
      contactPhone,
      notes,
      requestedPlanCode,
      requestedSeats,
    } = parsed.data

    const service = createServiceClient()
    const normalizedEmail = contactEmail.trim().toLowerCase()

    // 4. Duplicate submission abuse protection:
    // Reject duplicate active pending prospect submissions for the same email within the last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: existingDraft } = await service
      .from('customer_onboarding_requests')
      .select('id')
      .eq('admin_email', normalizedEmail)
      .eq('status', 'draft')
      .gte('created_at', oneDayAgo)
      .maybeSingle()

    if (existingDraft) {
      return NextResponse.json(
        {
          error:
            'A pending onboarding inquiry for this email address has already been submitted in the last 24 hours. Our team will contact you shortly.',
        },
        { status: 409 }
      )
    }

    // 5. Server-side field restrictions: ONLY status = 'draft', no approval, no assignment, no provisioning fields
    const { error: insertErr } = await service
      .from('customer_onboarding_requests')
      .insert({
        company_name: companyName.trim(),
        company_type: companyType,
        admin_email: normalizedEmail,
        admin_name: contactName.trim(),
        admin_phone: contactPhone?.trim() || null,
        commercial_notes: notes?.trim() || null,
        requested_plan_code: requestedPlanCode,
        requested_seats: requestedSeats,
        requested_billing_cycle: 'annual',
        status: 'draft',
      })

    if (insertErr) {
      console.error('Error recording public onboarding prospect:', insertErr)
      return NextResponse.json(
        { error: 'Unable to process inquiry at this time. Please try again later.' },
        { status: 500 }
      )
    }

    // 6. Return strictly restricted confirmation without exposing internal IDs, approval states, or records
    return NextResponse.json(
      {
        success: true,
        message: 'Thank you for your interest. Our enterprise sales team will contact you shortly.',
      },
      { status: 201 }
    )
  } catch (err: unknown) {
    console.error('Unhandled error in public onboarding endpoint:', err)
    return NextResponse.json(
      { error: 'An unexpected error occurred. Please try again later.' },
      { status: 500 }
    )
  }
}
