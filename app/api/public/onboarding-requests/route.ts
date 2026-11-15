// app/api/public/onboarding-requests/route.ts
// Production X: Deliberately Restricted Public Prospect Onboarding Endpoint
import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { PLAN_CONFIGS, type PlanTier } from '@/lib/subscriptions/config'
import { z } from 'zod'

const PublicOnboardingSchema = z.object({
  companyName: z.string().min(2, 'Company name required').max(100),
  companyType: z.enum(['developer', 'channel_partner']),
  contactEmail: z.string().email('Valid contact email required'),
  contactName: z.string().min(2, 'Contact name required'),
  contactPhone: z.string().optional(),
  notes: z.string().max(1000).optional(),
  requestedPlanCode: z.enum(['free', 'starter', 'growth', 'enterprise']).default('growth'),
  requestedSeats: z.number().int().min(1).max(500).default(5),
})

// In-memory rate limiting map for basic abuse defense
const IP_RATE_LIMIT = new Map<string, { count: number; resetAt: number }>()

export async function POST(request: NextRequest) {
  try {
    // 1. Basic Rate Limiting Defense (max 5 submissions per 15 minutes per IP)
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const now = Date.now()
    const rateData = IP_RATE_LIMIT.get(ip)

    if (rateData && rateData.resetAt > now) {
      if (rateData.count >= 5) {
        return NextResponse.json(
          { error: 'Too many requests. Please try again later.' },
          { status: 429 }
        )
      }
      rateData.count++
    } else {
      IP_RATE_LIMIT.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 })
    }

    // 2. Validate input with strict schema
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

    // 3. Resolve system prospect user or fallback service actor for unauthenticated public requests
    // Server-side field restrictions: ONLY status = 'draft', no approval, no assignment, no provisioning fields
    const { data: record, error } = await service
      .from('customer_onboarding_requests')
      .insert({
        company_name: companyName.trim(),
        company_type: companyType,
        admin_email: contactEmail.trim().toLowerCase(),
        admin_name: contactName.trim(),
        admin_phone: contactPhone?.trim() || null,
        commercial_notes: notes?.trim() || null,
        requested_plan_code: requestedPlanCode,
        requested_seats: requestedSeats,
        requested_billing_cycle: 'annual',
        status: 'draft',
      })
      .select('id, company_name, created_at')
      .single()

    if (error || !record) {
      console.error('Error inserting public onboarding prospect:', error)
      return NextResponse.json(
        { error: 'Failed to record onboarding request.' },
        { status: 500 }
      )
    }

    // 4. Return strictly restricted confirmation without exposing internal IDs, approval states, or records
    return NextResponse.json(
      {
        success: true,
        message: 'Thank you for your interest. Our enterprise sales team will contact you shortly.',
      },
      { status: 201 }
    )
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: errorMsg }, { status: 500 })
  }
}
