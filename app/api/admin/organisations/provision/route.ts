// app/api/admin/organisations/provision/route.ts
// Production X Platform Administration: Customer Organisation & Subscription Provisioning
import { NextResponse, type NextRequest } from 'next/server'
import { authenticateCaller } from '@/lib/auth/tenant'
import { createServiceClient } from '@/lib/supabase/server'
import { slugify, isReservedSlug } from '@/lib/utils/slugify'
import { PLAN_CONFIGS, type PlanTier } from '@/lib/dal/subscriptions'
import { createEmployeeInvitation } from '@/lib/dal/invitations'
import { z } from 'zod'

const ProvisionOrgSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/).optional(),
  type: z.enum(['developer', 'channel_partner']),
  planTier: z.enum(['free', 'starter', 'growth', 'enterprise', 'custom']).default('growth'),
  includedSeats: z.number().int().min(1).max(500).optional(),
  adminEmail: z.string().email('Please enter a valid administrator email address'),
  billingCycle: z.enum(['monthly', 'annual']).default('annual'),
})

export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateCaller()
    if (!authResult.success) {
      return authResult.response
    }

    const { auth } = authResult
    const service = createServiceClient()

    // Parse payload
    const body = await request.json()
    const parsed = ProvisionOrgSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid provisioning specification', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { name, type, planTier, adminEmail, billingCycle } = parsed.data
    const planConfig = PLAN_CONFIGS[planTier as PlanTier]
    const includedSeats = parsed.data.includedSeats ?? planConfig.defaultIncludedSeats

    // Resolve unique slug
    const baseSlug = parsed.data.slug || slugify(name)
    let slug = baseSlug
    if (isReservedSlug(slug)) {
      slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`
    }

    const { data: existing } = await service
      .from('organisations')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()

    if (existing) {
      slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`
    }

    // 1. Create the customer organisation
    const legacyPlan = planTier === 'free' ? 'free' : planTier === 'enterprise' ? 'enterprise' : 'growth'
    const { data: org, error: orgError } = await service
      .from('organisations')
      .insert({
        name,
        slug,
        type,
        plan: legacyPlan,
      })
      .select()
      .single()

    if (orgError || !org) {
      console.error('Error provisioning organisation:', orgError)
      return NextResponse.json({ error: orgError?.message || 'Failed to provision organisation' }, { status: 500 })
    }

    // 2. Create subscription record with configured seat entitlement
    const { error: subError } = await service
      .from('org_subscriptions')
      .insert({
        org_id: org.id,
        plan_tier: planTier,
        included_seats: includedSeats,
        additional_seats: 0,
        status: 'active',
        billing_cycle: billingCycle,
        current_period_start: new Date().toISOString(),
        current_period_end: new Date(Date.now() + 365 * 86400000).toISOString(),
      })

    if (subError) {
      console.error('Error creating subscription:', subError)
      // Non-fatal if table pending migration: fallback will use plan tier
    }

    // 3. Issue primary administrator invitation
    const inviteResult = await createEmployeeInvitation(
      org.id,
      auth.profile.id,
      adminEmail,
      'owner',
      14 // 14 days expiry for primary administrator onboarding
    )

    const origin = request.nextUrl.origin
    const activationUrl = inviteResult.plaintextToken ? `${origin}/invite/${inviteResult.plaintextToken}` : null

    return NextResponse.json(
      {
        success: true,
        message: 'Customer organisation provisioned successfully with subscription seats.',
        organisation: org,
        subscription: {
          planTier,
          includedSeats,
          billingCycle,
        },
        activation: {
          adminEmail,
          invitationId: inviteResult.invitation?.id,
          activationUrl,
        },
      },
      { status: 201 }
    )
  } catch (err) {
    console.error('Error in platform provisioning:', err)
    return NextResponse.json({ error: 'Failed to provision organisation' }, { status: 500 })
  }
}
