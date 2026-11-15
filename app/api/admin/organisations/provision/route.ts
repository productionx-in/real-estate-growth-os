// app/api/admin/organisations/provision/route.ts
// Production X Platform Administration: Super Admin Organization & Subscription Provisioning
import { NextResponse, type NextRequest } from 'next/server'
import crypto from 'node:crypto'
import { authenticatePlatformAdmin, logPlatformAction } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'
import { slugify, isReservedSlug } from '@/lib/utils/slugify'
import { PLAN_CONFIGS, type PlanTier } from '@/lib/dal/subscriptions'
import { getEmailAdapter } from '@/lib/email/adapter'
import { z } from 'zod'

const ProvisionOrgSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/).optional(),
  type: z.enum(['developer', 'channel_partner']),
  planTier: z.enum(['free', 'starter', 'growth', 'enterprise', 'custom']).default('growth'),
  includedSeats: z.number().int().min(1).max(500).optional(),
  adminEmail: z.string().email('Please enter a valid administrator email address'),
  adminName: z.string().optional(),
  billingCycle: z.enum(['monthly', 'annual']).default('annual'),
})

export async function POST(request: NextRequest) {
  try {
    // 1. Enforce Platform Super Admin authorization and MFA AAL2 verification
    const authResult = await authenticatePlatformAdmin(['super_admin'], true)
    if (!authResult.success) {
      return authResult.response
    }

    const { auth } = authResult
    const service = createServiceClient()

    // 2. Validate provisioning payload
    const body = await request.json()
    const parsed = ProvisionOrgSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid provisioning specification', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { name, type, planTier, adminEmail, adminName, billingCycle } = parsed.data
    const normalizedEmail = adminEmail.trim().toLowerCase()
    const planConfig = PLAN_CONFIGS[planTier as PlanTier]
    const includedSeats = parsed.data.includedSeats ?? planConfig.defaultIncludedSeats

    // 3. Resolve unique slug safely
    const baseSlug = parsed.data.slug || slugify(name)
    let slug = baseSlug
    if (isReservedSlug(slug)) {
      slug = `${baseSlug}-${crypto.randomBytes(2).toString('hex')}`
    }

    const { data: existingOrg } = await service
      .from('organisations')
      .select('id')
      .eq('slug', slug)
      .maybeSingle()

    if (existingOrg) {
      slug = `${baseSlug}-${crypto.randomBytes(2).toString('hex')}`
    }

    // 4. Create customer organisation
    const legacyPlan = planTier === 'free' ? 'free' : planTier === 'enterprise' ? 'enterprise' : 'growth'
    const { data: org, error: orgError } = await service
      .from('organisations')
      .insert({
        name: name.trim(),
        slug,
        type,
        plan: legacyPlan,
      })
      .select()
      .single()

    if (orgError || !org) {
      console.error('Error provisioning organisation:', orgError)
      return NextResponse.json(
        { error: orgError?.message || 'Failed to provision organisation' },
        { status: 500 }
      )
    }

    // 5. Create authoritative subscription record with contracted seat entitlements
    const { data: subscription, error: subError } = await service
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
      .select()
      .single()

    if (subError) {
      console.error('Error creating subscription:', subError)
    }

    // 6. Secure server-side invitation generation for primary administrator
    // Generates 256-bit cryptographic token and stores ONLY the SHA-256 hash
    const rawToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const expiresAt = new Date(Date.now() + 14 * 86400000).toISOString() // 14-day expiry for primary admin

    const { data: invitation, error: inviteError } = await service
      .from('org_invitations')
      .insert({
        org_id: org.id,
        invited_by: auth.profile.id,
        email: normalizedEmail,
        role: 'owner',
        token_hash: tokenHash,
        status: 'pending',
        expires_at: expiresAt,
      })
      .select('id, email, role, status, expires_at')
      .single()

    if (inviteError || !invitation) {
      console.error('Error creating primary administrator invitation:', inviteError)
      return NextResponse.json(
        { error: 'Failed to issue primary administrator invitation' },
        { status: 500 }
      )
    }

    // 7. Transactional email dispatch via provider-independent mailer
    const origin = request.nextUrl.origin
    const inviteUrl = `${origin}/invite/${rawToken}`
    const mailer = getEmailAdapter()

    await mailer.sendInvitationEmail({
      to: normalizedEmail,
      orgName: org.name,
      role: 'Owner & Primary Administrator',
      inviteUrl,
      inviterName: auth.profile.full_name || 'Production X Super Admin',
    })

    // 8. Record provisioning event in platform audit log
    await logPlatformAction({
      actorUserId: auth.user.id,
      actorRole: auth.platformUser.role,
      action: 'organisation.provision',
      targetEntityType: 'organisation',
      targetEntityId: org.id,
      metadata: {
        name: org.name,
        slug: org.slug,
        type: org.type,
        planTier,
        includedSeats,
        adminEmail: normalizedEmail,
        adminName: adminName || null,
        billingCycle,
        invitationId: invitation.id,
      },
      ipAddress: request.headers.get('x-forwarded-for') || undefined,
      userAgent: request.headers.get('user-agent') || undefined,
    })

    // 9. Return HTTP 201 Created — Note: RAW TOKEN IS NEVER RETURNED IN API RESPONSE
    return NextResponse.json(
      {
        success: true,
        message: 'Customer organisation provisioned successfully. Activation email dispatched.',
        organisation: {
          id: org.id,
          name: org.name,
          slug: org.slug,
          type: org.type,
        },
        subscription: {
          id: subscription?.id,
          planTier,
          includedSeats,
          billingCycle,
        },
        activation: {
          adminEmail: normalizedEmail,
          invitationId: invitation.id,
          expiresAt: invitation.expires_at,
          emailDispatched: true,
        },
      },
      { status: 201 }
    )
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown provisioning error'
    console.error('Error in platform provisioning:', err)
    return NextResponse.json({ error: errorMsg }, { status: 500 })
  }
}
