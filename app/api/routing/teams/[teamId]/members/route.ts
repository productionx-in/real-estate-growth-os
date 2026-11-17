// app/api/routing/teams/[teamId]/members/route.ts
// PUT: add a member to a team or update weight / daily capacity / duty. DELETE: remove a member.
import { NextResponse, type NextRequest } from 'next/server'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { ROUTING_ADMIN_ROLES } from '@/lib/auth/permissions'
import { TeamMemberUpsertSchema } from '@/lib/validations/routing'
import { removeTeamMember, upsertTeamMember } from '@/lib/dal/routing'
import { parseJson, respond, serverError } from '@/lib/routing/http'
import { auditMember } from '@/lib/dal/org-audit'
import { requireModule } from '@/lib/auth/entitlements'

type Ctx = { params: Promise<{ teamId: string }> }

export async function PUT(request: NextRequest, { params }: Ctx) {
  try {
    const { teamId } = await params
    const input = await parseJson(request, TeamMemberUpsertSchema)
    if (!input.ok) return input.response
    const auth = await authorizeOrgAccess(input.data.orgId, [...ROUTING_ADMIN_ROLES])
    if (!auth.success) return auth.response
    { const gate = await requireModule(auth.context.orgId, 'routing'); if (gate) return gate }
    const result = await upsertTeamMember(teamId, input.data)
    if (result.success) await auditMember(request, auth.context, input.data.orgId, 'routing.team_member_set', { type: 'routing_team', id: teamId }, { profile_id: (input.data as { profileId?: string }).profileId })
    return respond(result)
  } catch (err) {
    return serverError('upsert team member', err)
  }
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    const { teamId } = await params
    const orgId = request.nextUrl.searchParams.get('orgId')
    const profileId = request.nextUrl.searchParams.get('profileId')
    if (!orgId || !profileId) return NextResponse.json({ error: 'Missing required orgId or profileId' }, { status: 400 })
    const auth = await authorizeOrgAccess(orgId, [...ROUTING_ADMIN_ROLES])
    if (!auth.success) return auth.response
    { const gate = await requireModule(auth.context.orgId, 'routing'); if (gate) return gate }
    const result = await removeTeamMember(orgId, teamId, profileId)
    if (result.success) await auditMember(request, auth.context, orgId, 'routing.team_member_removed', { type: 'routing_team', id: teamId }, { profile_id: profileId })
    return respond(result)
  } catch (err) {
    return serverError('remove team member', err)
  }
}
