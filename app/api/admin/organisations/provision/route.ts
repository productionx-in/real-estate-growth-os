// app/api/admin/organisations/provision/route.ts
// Production X Platform Administration: Super Admin Organization & Subscription Provisioning
import { NextResponse, type NextRequest } from 'next/server'
import crypto from 'node:crypto'
import { authenticatePlatformAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'
import { slugify, isReservedSlug } from '@/lib/utils/slugify'
import { getEmailAdapter } from '@/lib/email/adapter'
import { z } from 'zod'

const ProvisionOrgSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  slug: z.string().min(2).max(60).regex(/^[a-z0-9-]+$/).optional(),
  type: z.enum(['developer', 'channel_partner']),
  planTier: z.enum(['free', 'starter', 'growth', 'enterprise']),
  includedSeats: z.number().int().min(1, 'Included seats must be at least 1').max(500).optional(),
  adminEmail: z.string().email('Please enter a valid administrator email address'),
  adminName: z.string().optional(),
  billingCycle: z.enum(['monthly', 'annual']),
  onboardingRequestId: z.string().uuid().optional(),
  commercialOverrideCode: z.string().min(3).max(100).optional(),
})

export async function POST(request: NextRequest) {
  try {
    // 1. Enforce Platform Super Admin authorization and MFA AAL2 verification
    // Derived strictly from the verified session; client cannot spoof actor UUID
    const authResult = await authenticatePlatformAdmin(['super_admin'], true)
    if (!authResult.success) {
      return authResult.response
    }

    const { auth } = authResult
    const service = createServiceClient()

    // 2. Validate provisioning payload - NO silent defaults for planTier or billingCycle
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
      commercialOverrideCode,
    } = parsed.data

    const normalizedEmail = adminEmail.trim().toLowerCase()

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
    // Derives baseline seats from DB plan version if includedSeats is omitted
    // Validates pricing, org type match, onboarding request FOR UPDATE, and commercial override code
    const { data: provisionRpcResult, error: rpcError } = await (service.rpc as any)(
      'provision_organisation_atomic',
      {
        p_actor_auth_id: auth.user.id,
        p_org_name: name.trim(),
        p_org_slug: slug,
        p_org_type: type,
        p_plan_tier: planTier,
        p_included_seats: includedSeats || null,
        p_billing_cycle: billingCycle,
        p_owner_email: normalizedEmail,
        p_invitation_token_hash: tokenHash,
        p_token_expires_at: expiresAt,
        p_onboarding_request_id: onboardingRequestId || null,
        p_ip_address: request.headers.get('x-forwarded-for') || null,
        p_user_agent: request.headers.get('user-agent') || null,
        p_commercial_override_code: commercialOverrideCode?.trim() || null,
      }
    )

    if (rpcError) {
      console.error('Transactional organisation provisioning failed (rolled back):', rpcError)
      const isConflict =
        rpcError.message?.toLowerCase().includes('conflict') ||
        rpcError.message?.toLowerCase().includes('already exists')
      const isValidation =
        rpcError.message?.toLowerCase().includes('validation') ||
        rpcError.message?.toLowerCase().includes('commercial policy violation')
      const isInvalidState = rpcError.message?.toLowerCase().includes('invalid state')

      return NextResponse.json(
        { error: rpcError.message || 'Failed to provision organisation atomically' },
        { status: isConflict ? 409 : isInvalidState ? 422 : isValidation ? 400 : 500 }
      )
    }

    const row = Array.isArray(provisionRpcResult) ? provisionRpcResult[0] : (provisionRpcResult as any)
    const orgId = row?.org_id
    const orgSlug = row?.org_slug || slug
    const subscriptionId = row?.subscription_id
    const invitationId = row?.invitation_id
    const invoiceNumber = row?.invoice_number
    const effectiveSeats = row?.included_seats || includedSeats

    // 6. AFTER DB COMMIT: Transactional email dispatch via provider-independent mailer
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
        inviterName: auth.profile?.full_name || 'Production X Super Admin',
      })
      emailDispatched = true

      // Update delivery state in database via dedicated RPC
      const { data: recordData, error: recordError } = await (service.rpc as any)(
        'record_invitation_delivery_outcome',
        {
          p_invitation_id: invitationId,
          p_delivery_status: 'delivered',
          p_expected_attempts: 1,
          p_error_message: null,
        }
      )
      if (recordError || (recordData && !recordData.success)) {
        console.warn(
          'Warning: Failed to record delivery confirmation in database:',
          recordError || 'Zero rows updated (mismatched attempt counter)'
        )
      }
    } catch (mailErr: unknown) {
      emailDispatched = false
      emailError = mailErr instanceof Error ? mailErr.message : 'Email dispatch failed'
      console.error(
        'Warning: Invitation email dispatch failed after commit (recorded for retry):',
        mailErr
      )

      // Record delivery failure in database without rolling back provisioning
      const { data: recordData, error: recordError } = await (service.rpc as any)(
        'record_invitation_delivery_outcome',
        {
          p_invitation_id: invitationId,
          p_delivery_status: 'failed',
          p_expected_attempts: 1,
          p_error_message: emailError,
        }
      )
      if (recordError || (recordData && !recordData.success)) {
        console.error(
          'CRITICAL: Failed to record delivery failure in database:',
          recordError || 'Zero rows updated (mismatched attempt counter)'
        )
      }
    }

    // 7. Return HTTP 201 Created
    // CRITICAL: NEVER return the raw invitation token or token_hash in API response
    return NextResponse.json(
      {
        success: true,
        message: emailDispatched
          ? 'Customer organisation provisioned successfully. Activation email dispatched.'
          : 'Customer organisation provisioned successfully. Invitation email delivery failed; retry available.',
        organisation: {
          id: orgId,
          name: name.trim(),
          slug: orgSlug,
          type,
        },
        subscription: {
          id: subscriptionId,
          planTier,
          includedSeats: effectiveSeats,
          billingCycle,
          status: planTier === 'free' ? 'trialing' : 'pending_payment',
          invoiceNumber: invoiceNumber || null,
        },
        invitation: {
          id: invitationId,
          adminEmail: normalizedEmail,
          sent: emailDispatched,
          deliveryStatus: emailDispatched ? 'delivered' : 'failed',
          retryable: !emailDispatched,
          deliveryError: emailError,
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
