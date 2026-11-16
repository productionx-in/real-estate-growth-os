// app/api/routing/teams/[teamId]/route.ts
// PATCH: rename / activate / deactivate a team. DELETE: remove a team (blocked while a rule targets it).
import { NextResponse, type NextRequest } from 'next/server'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { ROUTING_ADMIN_ROLES } from '@/lib/auth/permissions'
import { TeamUpdateSchema } from '@/lib/validations/routing'
import { deleteTeam, updateTeam } from '@/lib/dal/routing'
import { parseJson, respond, serverError } from '@/lib/routing/http'

type Ctx = { params: Promise<{ teamId: string }> }

export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const { teamId } = await params
    const input = await parseJson(request, TeamUpdateSchema)
    if (!input.ok) return input.response
    const auth = await authorizeOrgAccess(input.data.orgId, [...ROUTING_ADMIN_ROLES])
    if (!auth.success) return auth.response
    return respond(await updateTeam(teamId, input.data))
  } catch (err) {
    return serverError('update team', err)
  }
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    const { teamId } = await params
    const orgId = request.nextUrl.searchParams.get('orgId')
    if (!orgId) return NextResponse.json({ error: 'Missing required orgId' }, { status: 400 })
    const auth = await authorizeOrgAccess(orgId, [...ROUTING_ADMIN_ROLES])
    if (!auth.success) return auth.response
    return respond(await deleteTeam(orgId, teamId))
  } catch (err) {
    return serverError('delete team', err)
  }
}
