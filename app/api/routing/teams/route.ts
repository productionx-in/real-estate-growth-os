// app/api/routing/teams/route.ts
// GET: list teams with members (any active member). POST: create team (owner/admin/manager).
import { NextResponse, type NextRequest } from 'next/server'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { ROUTING_ADMIN_ROLES } from '@/lib/auth/permissions'
import { TeamCreateSchema } from '@/lib/validations/routing'
import { createTeam, listTeams } from '@/lib/dal/routing'
import { parseJson, respond, serverError } from '@/lib/routing/http'
import { auditMember } from '@/lib/dal/org-audit'
import { requireModule } from '@/lib/auth/entitlements'

export async function GET(request: NextRequest) {
  try {
    const orgId = request.nextUrl.searchParams.get('orgId')
    if (!orgId) return NextResponse.json({ error: 'Missing required orgId' }, { status: 400 })
    const auth = await authorizeOrgAccess(orgId)
    if (!auth.success) return auth.response
    { const gate = await requireModule(auth.context.orgId, 'routing'); if (gate) return gate }
    return respond(await listTeams(orgId))
  } catch (err) {
    return serverError('list teams', err)
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = await parseJson(request, TeamCreateSchema)
    if (!input.ok) return input.response
    const auth = await authorizeOrgAccess(input.data.orgId, [...ROUTING_ADMIN_ROLES])
    if (!auth.success) return auth.response
    { const gate = await requireModule(auth.context.orgId, 'routing'); if (gate) return gate }
    const result = await createTeam(input.data)
    if (result.success) await auditMember(request, auth.context, input.data.orgId, 'routing.team_created', { type: 'routing_team', id: (result.data as { id?: string })?.id ?? null })
    return respond(result, 201)
  } catch (err) {
    return serverError('create team', err)
  }
}
