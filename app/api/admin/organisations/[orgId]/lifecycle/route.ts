// app/api/admin/organisations/[orgId]/lifecycle/route.ts
// REGrow Platform Administration: change a customer organisation's lifecycle state.
//
//   active      — normal use
//   grace       — normal use, with a payment / renewal warning shown to the customer
//   suspended   — read-only: every member keeps signing in but can change nothing; lead capture continues
//   deactivated — nobody can use the workspace; data is kept; members whose only workspace this was are signed out
//
// Super admins only, with MFA (AAL2). A reason is mandatory. The database function applies the change, records
// the state event and writes the customer-visible audit entry atomically; the platform audit log records the actor.
import { NextResponse, type NextRequest } from 'next/server'
import { authenticatePlatformAdmin, logPlatformAction } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'
import { revokeSessionsIfNoActiveMembership } from '@/lib/dal/invitations'
import { requestOrigin } from '@/lib/dal/org-audit'
import { z } from 'zod'

const LifecycleSchema = z.object({
  state: z.enum(['active', 'grace', 'suspended', 'deactivated']),
  reason: z.string().trim().min(3, 'Give a reason of at least 3 characters').max(500),
})

interface RouteContext {
  params: Promise<{ orgId: string }>
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const authResult = await authenticatePlatformAdmin(['super_admin'], true)
    if (!authResult.success) return authResult.response
    const { auth } = authResult

    const { orgId } = await params
    if (!z.string().uuid().safeParse(orgId).success) {
      return NextResponse.json({ error: 'Invalid organisation id' }, { status: 400 })
    }

    const parsed = LifecycleSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid lifecycle change', details: parsed.error.flatten() }, { status: 400 })
    }
    const { state, reason } = parsed.data

    const service = createServiceClient()
    const { data, error } = await service.rpc('set_organisation_lifecycle', {
      p_org: orgId,
      p_state: state,
      p_reason: reason,
      p_actor_user: auth.user.id,
      p_actor_kind: 'platform',
      p_actor_label: 'REGrow platform team',
    })
    if (error) {
      const notFound = error.message.includes('not found')
      return NextResponse.json(
        { error: notFound ? 'Organisation not found' : error.message.replace(/^lifecycle: /, '') },
        { status: notFound ? 404 : 400 }
      )
    }
    const result = data as { from: string; to: string; members_changed: number; unchanged: boolean }

    // Deactivation: sign out anyone who now has no active workspace at all.
    let sessionsRevoked = 0
    if (state === 'deactivated' && !result.unchanged) {
      const { data: members } = await service
        .from('org_members')
        .select('profile_id')
        .eq('org_id', orgId)
        .eq('lifecycle_suspended', true)
      for (const m of members ?? []) {
        if (await revokeSessionsIfNoActiveMembership(m.profile_id)) sessionsRevoked++
      }
    }

    const origin = requestOrigin(request)
    const audit = await logPlatformAction({
      actorUserId: auth.user.id,
      actorRole: auth.platformUser.role,
      action: 'organisation.lifecycle_changed',
      targetEntityType: 'organisation',
      targetEntityId: orgId,
      metadata: { from: result.from, to: result.to, reason, members_changed: result.members_changed, sessions_revoked: sessionsRevoked },
      ipAddress: origin.ipAddress ?? undefined,
      userAgent: origin.userAgent ?? undefined,
    })
    if (!audit.success) {
      // The change is applied and recorded in the customer's audit trail; surface the platform-log failure.
      return NextResponse.json(
        { success: true, ...result, sessionsRevoked, warning: 'Change applied, but the platform audit entry failed to save.' },
        { status: 200 }
      )
    }

    return NextResponse.json({ success: true, ...result, sessionsRevoked }, { status: 200 })
  } catch (err) {
    console.error('Error changing organisation lifecycle:', err)
    return NextResponse.json({ error: 'Failed to change organisation state' }, { status: 500 })
  }
}
