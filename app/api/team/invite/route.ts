// app/api/team/invite/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { authenticateCaller } from '@/lib/auth/tenant'
import { createServiceClient } from '@/lib/supabase/server'
import { createEmployeeInvitation } from '@/lib/dal/invitations'
import { getEmailAdapter } from '@/lib/email/adapter'
import type { MemberRole } from '@/types/database'
import { recordOrgAudit, requestOrigin } from '@/lib/dal/org-audit'
import { z } from 'zod'
import { isActiveMembership } from '@/lib/auth/permissions'

const InviteSchema = z.object({
  orgSlug: z.string().optional(),
  orgId: z.string().uuid().optional(),
  email: z.string().email('Please enter a valid email address'),
  role: z.enum(['owner', 'admin', 'manager', 'sales_exec', 'readonly']).default('sales_exec'),
  expiresInDays: z.number().int().min(1).max(30).default(7),
})

export async function POST(request: NextRequest) {
  try {
    const authResult = await authenticateCaller()
    if (!authResult.success) {
      return authResult.response
    }

    const { auth } = authResult
    const service = createServiceClient()

    const body = await request.json()
    const parsed = InviteSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { orgSlug, orgId, email, role, expiresInDays } = parsed.data
    let targetOrgId = orgId

    if (!targetOrgId && orgSlug) {
      const { data: org } = await service
        .from('organisations')
        .select('id')
        .eq('slug', orgSlug)
        .maybeSingle()

      if (org) targetOrgId = org.id
    }

    if (!targetOrgId) {
      return NextResponse.json({ error: 'Organisation identifier required' }, { status: 400 })
    }

    // Verify caller has administrative privileges (owner or admin)
    const { data: callerMembership } = await service
      .from('org_members')
      .select('role, status')
      .eq('status', 'active')
      .eq('org_id', targetOrgId)
      .eq('profile_id', auth.profile.id)
      .maybeSingle()

    if (!callerMembership || !isActiveMembership(callerMembership.status) || !['owner', 'admin'].includes(callerMembership.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions. Only owners and administrators can invite employees.' },
        { status: 403 }
      )
    }

    const result = await createEmployeeInvitation(
      targetOrgId,
      auth.profile.id,
      email,
      role as MemberRole,
      expiresInDays
    )

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error?.includes('Seat limit reached') ? 409 : 400 }
      )
    }

    await recordOrgAudit({
      orgId: targetOrgId,
      action: 'invitation.created',
      actorUserId: auth.user.id,
      actorProfileId: auth.profile.id,
      actorLabel: auth.profile.full_name,
      targetType: 'invitation',
      targetId: result.invitation?.id,
      metadata: { email: email.trim().toLowerCase(), role, expires_in_days: expiresInDays },
      ...requestOrigin(request),
    })

    const { data: orgData } = await service
      .from('organisations')
      .select('name')
      .eq('id', targetOrgId)
      .maybeSingle()

    const origin = request.nextUrl.origin
    if (result.plaintextToken) {
      const inviteUrl = `${origin}/invite/${result.plaintextToken}`
      const mailer = getEmailAdapter()
      await mailer.sendInvitationEmail({
        to: email,
        orgName: orgData?.name || 'Workspace',
        role: role,
        inviteUrl,
        inviterName: auth.profile.full_name,
      })
    }

    return NextResponse.json(
      {
        success: true,
        invitation: result.invitation,
        emailDispatched: true,
      },
      { status: 201 }
    )
  } catch (err) {
    console.error('Error creating invitation:', err)
    return NextResponse.json({ error: 'Failed to process employee invitation' }, { status: 500 })
  }
}
