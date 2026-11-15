// app/api/admin/invitations/retry/route.ts
// Production X Platform Administration: Super Admin Invitation Retry & Resend Endpoint
import { NextResponse, type NextRequest } from 'next/server'
import crypto from 'node:crypto'
import { authenticatePlatformAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'
import { getEmailAdapter } from '@/lib/email/adapter'
import { z } from 'zod'

const RetryInvitationSchema = z.object({
  invitationId: z.string().uuid('Valid invitation ID required'),
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

    // 2. Validate payload
    const body = await request.json()
    const parsed = RetryInvitationSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid invitation specification', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { invitationId } = parsed.data

    // 3. Query existing invitation record
    const { data: invitation, error: fetchError } = await (service.from('org_invitations') as any)
      .select('id, org_id, email, role, status, expires_at, delivery_attempts')
      .eq('id', invitationId)
      .single()

    if (fetchError || !invitation) {
      return NextResponse.json(
        { error: 'Invitation not found', message: `Invitation ${invitationId} does not exist` },
        { status: 404 }
      )
    }

    // 4. Validate invitation status - reject accepted, canceled, or revoked invitations
    if (invitation.status !== 'pending') {
      return NextResponse.json(
        {
          error: 'Invalid invitation state',
          message: `Cannot resend invitation with status '${invitation.status}'. Only pending invitations can be resent.`,
        },
        { status: 400 }
      )
    }

    // 5. Validate expiration - expired invitations cannot be resent without replacement workflow
    const now = new Date()
    const expiresAt = new Date(invitation.expires_at)
    if (expiresAt <= now) {
      return NextResponse.json(
        {
          error: 'Invitation expired',
          message: 'This invitation has expired. Expired invitations cannot be resent directly; generate a replacement invitation.',
        },
        { status: 400 }
      )
    }

    // 6. Fetch organisation details for email template
    const { data: org } = await service
      .from('organisations')
      .select('name')
      .eq('id', invitation.org_id)
      .single()

    const orgName = org?.name || 'Your Organisation'

    // 7. Generate fresh 256-bit cryptographic token and update token_hash in DB
    const rawToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const newExpiresAt = new Date(Date.now() + 7 * 86400000).toISOString()
    const nextAttempts = (invitation.delivery_attempts || 0) + 1

    await (service.from('org_invitations') as any)
      .update({
        token_hash: tokenHash,
        expires_at: newExpiresAt,
        delivery_status: 'pending',
        delivery_attempts: nextAttempts,
        delivery_updated_at: new Date().toISOString(),
      })
      .eq('id', invitationId)

    // 8. Attempt email delivery
    let emailDispatched = false
    let deliveryError: string | null = null

    try {
      const origin = request.nextUrl.origin
      const inviteUrl = `${origin}/invite/${rawToken}`
      const mailer = getEmailAdapter()

      await mailer.sendInvitationEmail({
        to: invitation.email,
        orgName,
        role: invitation.role,
        inviteUrl,
        inviterName: auth.profile?.full_name || 'Production X Super Admin',
      })
      emailDispatched = true

      await (service.from('org_invitations') as any)
        .update({
          delivery_status: 'delivered',
          last_delivery_error: null,
          delivery_updated_at: new Date().toISOString(),
        })
        .eq('id', invitationId)
    } catch (mailErr: unknown) {
      emailDispatched = false
      deliveryError = mailErr instanceof Error ? mailErr.message : 'Email retry delivery failed'

      await (service.from('org_invitations') as any)
        .update({
          delivery_status: 'failed',
          last_delivery_error: deliveryError,
          delivery_updated_at: new Date().toISOString(),
        })
        .eq('id', invitationId)
    }

    // 9. Write platform audit log
    await service.from('platform_audit_logs').insert({
      actor_user_id: auth.user.id,
      actor_role: 'super_admin',
      action: 'retry_organisation_invitation',
      target_entity_type: 'org_invitations',
      target_entity_id: invitationId,
      metadata: {
        email: invitation.email,
        org_id: invitation.org_id,
        delivery_status: emailDispatched ? 'delivered' : 'failed',
        attempts: nextAttempts,
        delivery_error: deliveryError,
      },
    })

    // CRITICAL: NEVER return rawToken or tokenHash to client
    return NextResponse.json(
      {
        success: true,
        invitation: {
          id: invitationId,
          email: invitation.email,
          sent: emailDispatched,
          deliveryStatus: emailDispatched ? 'delivered' : 'failed',
          retryable: !emailDispatched,
          attempts: nextAttempts,
          deliveryError,
        },
      },
      { status: 200 }
    )
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown invitation retry error'
    console.error('Error in invitation retry route:', err)
    return NextResponse.json({ error: errorMsg }, { status: 500 })
  }
}
