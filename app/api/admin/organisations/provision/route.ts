// app/api/admin/organisations/provision/route.ts
// Production X Platform Administration: Super Admin Organization & Subscription Provisioning
import { NextResponse, type NextRequest } from 'next/server'
import crypto from 'node:crypto'
import { authenticatePlatformAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'
import { slugify, isReservedSlug } from '@/lib/utils/slugify'
import { PLAN_CONFIGS, type PlanTier } from '@/lib/subscriptions/config'
import { getEmailAdapter } from '@/lib/email/adapter'
import { z } from 'zod'

const ProvisionOrgSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/).optional(),
  type: z.enum(['developer', 'channel_partner']),
  planTier: z.enum(['free', 'starter', 'growth', 'enterprise', 'custom']),
  includedSeats: z.number().int().min(1, 'Included seats must be at least 1').max(500),
  adminEmail: z.string().email('Please enter a valid administrator email address'),
  adminName: z.string().optional(),
  billingCycle: z.enum(['monthly', 'annual']),
  onboardingRequestId: z.string().uuid().optional(),
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

    // 2. Validate provisioning payload - NO arbitrary/invented defaults
    const body = await request.json()
    const parsed = ProvisionOrgSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid provisioning specification', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const {
      name,
      type,
      planTier,
      includedSeats,
      adminEmail,
      adminName,
      billingCycle,
      onboardingRequestId,
    } = parsed.data

    const normalizedEmail = adminEmail.trim().toLowerCase()

    // Validate planTier against approved configuration
    const planConfig = PLAN_CONFIGS[planTier as PlanTier]
    if (!planConfig) {
      return NextResponse.json(
        { error: `Invalid plan tier: ${planTier}. Must match an approved subscription plan.` },
        { status: 400 }
      )
    }

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

    // 4. Generate 256-bit cryptographic token and SHA-256 hash for primary owner invite
    const rawToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const expiresAt = new Date(Date.now() + 14 * 86400000).toISOString() // 14-day expiry for primary admin

    // 5. Execute SINGLE TRANSACTIONAL DATABASE OPERATION via Postgres stored procedure
    // Handles: org creation, subscription creation, owner invitation, onboarding request update, audit log write
    // If ANY step fails, PostgreSQL automatically aborts and rolls back entire transaction
    const { data: provisionRpcResult, error: rpcError } = await (service.rpc as any)(
      'provision_organisation_atomic',
      {
        p_actor_auth_id: auth.user.id,
        p_org_name: name.trim(),
        p_org_slug: slug,
        p_org_type: type,
        p_plan_tier: planTier,
        p_included_seats: includedSeats,
        p_billing_cycle: billingCycle,
        p_admin_email: normalizedEmail,
        p_admin_name: adminName?.trim() || 'Primary Administrator',
        p_token_hash: tokenHash,
        p_expires_at: expiresAt,
        p_onboarding_request_id: onboardingRequestId || null,
        p_ip_address: request.headers.get('x-forwarded-for') || null,
        p_user_agent: request.headers.get('user-agent') || null,
      }
    )

    if (rpcError) {
      console.error('Transactional organisation provisioning failed (rolled back):', rpcError)
      const isConflict = rpcError.message?.toLowerCase().includes('conflict') || rpcError.message?.toLowerCase().includes('already in use')
      return NextResponse.json(
        { error: rpcError.message || 'Failed to provision organisation atomically' },
        { status: isConflict ? 409 : 500 }
      )
    }

    // RPC returns array of 1 row with: org_id, org_slug, subscription_id, invitation_id
    const row = Array.isArray(provisionRpcResult) ? provisionRpcResult[0] : (provisionRpcResult as any)
    const orgId = row?.org_id
    const orgSlug = row?.org_slug || slug
    const subscriptionId = row?.subscription_id
    const invitationId = row?.invitation_id

    // 6. AFTER DB COMMIT: Transactional email dispatch via provider-independent mailer
    // If email dispatch fails, the DB record is already committed. The pending invitation remains valid
    // and can be resent via the secure resend mechanism.
    let emailDispatched = false
    let emailError: string | null = null

    try {
      const origin = request.nextUrl.origin
      const inviteUrl = `${origin}/invite/${rawToken}`
      const mailer = getEmailAdapter()

      await mailer.sendInvitationEmail({
        to: normalizedEmail,
        orgName: name.trim(),
        role: 'Owner & Primary Administrator',
        inviteUrl,
        inviterName: auth.profile.full_name || 'Production X Super Admin',
      })
      emailDispatched = true
    } catch (mailErr: unknown) {
      emailDispatched = false
      emailError = mailErr instanceof Error ? mailErr.message : 'Email dispatch failed'
      console.error('Warning: Invitation email dispatch failed after commit (invitation preserved for resend):', mailErr)
    }

    // 7. Return HTTP 201 Created
    // CRITICAL: NEVER return the raw invitation token or invite URL in API response
    return NextResponse.json(
      {
        success: true,
        message: emailDispatched
          ? 'Customer organisation provisioned successfully. Activation email dispatched.'
          : 'Customer organisation provisioned successfully. Invitation email pending resend.',
        organisation: {
          id: orgId,
          name: name.trim(),
          slug: orgSlug,
          type,
        },
        subscription: {
          id: subscriptionId,
          planTier,
          includedSeats,
          billingCycle,
        },
        activation: {
          adminEmail: normalizedEmail,
          invitationId,
          expiresAt,
          emailDispatched,
          emailError,
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
