// app/api/routing/teams/[teamId]/members/route.ts
// PUT: add a member to a team or update weight / daily capacity / duty. DELETE: remove a member.
import { NextResponse, type NextRequest } from 'next/server'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { ROUTING_ADMIN_ROLES } from '@/lib/auth/permissions'
import { TeamMemberUpsertSchema } from '@/lib/validations/routing'
import { removeTeamMember, upsertTeamMember } from '@/lib/dal/routing'
import { parseJson, respond, serverError } from '@/lib/routing/http'

type Ctx = { params: Promise<{ teamId: string }> }

export async function PUT(request: NextRequest, { params }: Ctx) {
  try {
    const { teamId } = await params
    const input = await parseJson(request, TeamMemberUpsertSchema)
    if (!input.ok) return input.response
    const auth = await authorizeOrgAccess(input.data.orgId, [...ROUTING_ADMIN_ROLES])
    if (!auth.success) return auth.response
    return respond(await upsertTeamMember(teamId, input.data))
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
    return respond(await removeTeamMember(orgId, teamId, profileId))
  } catch (err) {
    return serverError('remove team member', err)
  }
}
