// app/api/admin/invitations/retry/route.ts
// REGrow Platform Administration: Super Admin Atomic Invitation Retry & Resend Endpoint
import { appUrl } from '@/lib/site/urls'
import { NextResponse, type NextRequest } from 'next/server'
import crypto from 'node:crypto'
import { authenticatePlatformAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'
import { sendInvitation } from '@/lib/email/service'
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

    // 3. Generate fresh 256-bit cryptographic token and SHA-256 hash
    const rawToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const newExpiresAt = new Date(Date.now() + 7 * 86400000).toISOString()

    // 4. ATOMIC DATABASE TRANSACTION: Lock invitation, verify status/expiry, rotate token, increment attempts, write audit log
    const { data: rotateResult, error: rotateError } = await (service.rpc as any)(
      'rotate_invitation_token_atomic',
      {
        p_actor_auth_id: auth.user.id,
        p_invitation_id: invitationId,
        p_new_token_hash: tokenHash,
        p_new_expires_at: newExpiresAt,
        p_ip_address: request.headers.get('x-forwarded-for') || null,
        p_user_agent: request.headers.get('user-agent') || null,
      }
    )

    if (rotateError) {
      console.error('Atomic invitation token rotation failed:', rotateError)
      const isNotFound = rotateError.message?.toLowerCase().includes('not found')
      const isInvalidState = rotateError.message?.toLowerCase().includes('invalid state')
      return NextResponse.json(
        { error: rotateError.message || 'Failed to rotate invitation token atomically' },
        { status: isNotFound ? 404 : isInvalidState ? 400 : 500 }
      )
    }

    const rotation = Array.isArray(rotateResult) ? rotateResult[0] : (rotateResult as any)
    const email = rotation?.email
    const orgName = rotation?.org_name || 'Your Organisation'
    const role = rotation?.role || 'owner'
    const attempts = rotation?.attempts || 1

    // 5. Dispatch email with rawToken out-of-band (ONLY after successful atomic DB rotation)
    let emailDispatched = false
    let deliveryError: string | null = null

    try {
      // Invitation links use the configured app URL, never the Host header of the request (lib/site/urls.ts).
      const origin = appUrl(request.nextUrl.origin) ?? request.nextUrl.origin
      const inviteUrl = `${origin}/invite/${rawToken}`
      const { data: invRow } = await service.from('org_invitations').select('org_id').eq('id', invitationId).maybeSingle()
      if (!invRow?.org_id) throw new Error('Invitation not found.')
      const sent = await sendInvitation(service, {
        orgId: invRow.org_id, invitationId, to: email, orgName, role, inviteUrl,
        inviterName: auth.profile?.full_name || 'REGrow Super Admin',
      })
      if (!sent.success) throw new Error(sent.error || 'The invitation e-mail could not be sent.')
      emailDispatched = true

      // Record successful delivery
      const { data: recordData, error: recordError } = await (service.rpc as any)(
        'record_invitation_delivery_outcome',
        {
          p_invitation_id: invitationId,
          p_delivery_status: 'delivered',
          p_expected_attempts: attempts,
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
      deliveryError = mailErr instanceof Error ? mailErr.message : 'Email retry delivery failed'
      console.error('Invitation retry email dispatch failed:', mailErr)

      // Record delivery failure
      const { data: recordData, error: recordError } = await (service.rpc as any)(
        'record_invitation_delivery_outcome',
        {
          p_invitation_id: invitationId,
          p_delivery_status: 'failed',
          p_expected_attempts: attempts,
          p_error_message: deliveryError,
        }
      )
      if (recordError || (recordData && !recordData.success)) {
        console.error(
          'CRITICAL: Failed to record delivery failure in database:',
          recordError || 'Zero rows updated (mismatched attempt counter)'
        )
      }
    }

    // 6. Return response - NEVER return rawToken or tokenHash
    return NextResponse.json(
      {
        success: true,
        invitation: {
          id: invitationId,
          email,
          sent: emailDispatched,
          deliveryStatus: emailDispatched ? 'delivered' : 'failed',
          retryable: !emailDispatched,
          attempts,
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
