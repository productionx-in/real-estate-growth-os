// app/api/team/members/role/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { authenticateCaller } from '@/lib/auth/tenant'
import { createServiceClient } from '@/lib/supabase/server'
import { changeMemberRole } from '@/lib/dal/invitations'
import type { MemberRole } from '@/types/database'
import { recordOrgAudit, requestOrigin } from '@/lib/dal/org-audit'
import { z } from 'zod'

const RoleSchema = z.object({
  orgSlug: z.string().optional(),
  orgId: z.string().uuid().optional(),
  memberId: z.string().uuid(),
  role: z.enum(['owner', 'admin', 'manager', 'team_lead', 'sales_exec', 'post_sales', 'readonly']),
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
    const parsed = RoleSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { orgSlug, orgId, memberId, role } = parsed.data
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

    const result = await changeMemberRole(targetOrgId, memberId, role as MemberRole, auth.profile.id)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    await recordOrgAudit({
      orgId: targetOrgId,
      action: 'member.role_changed',
      actorUserId: auth.user.id,
      actorProfileId: auth.profile.id,
      actorLabel: auth.profile.full_name,
      targetType: 'member',
      targetId: memberId,
      metadata: { profile_id: result.targetProfileId, from: result.previousRole, to: role },
      ...requestOrigin(request),
    })

    return NextResponse.json({ success: true, message: 'Role updated successfully.' }, { status: 200 })
  } catch (err) {
    console.error('Error changing member role:', err)
    return NextResponse.json({ error: 'Failed to update member role' }, { status: 500 })
  }
}
