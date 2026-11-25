// app/api/teams/[teamId]/route.ts — change or delete a team (team structure, 20260097). Owners, admins and managers,
// while team structure is on. Deleting is refused while a routing rule still sends leads to the team.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { auditMember } from '@/lib/dal/org-audit'
import { getSalesStructure } from '@/lib/dal/sales-structure'
import { deleteTeamStructure, saveTeam } from '@/lib/dal/teams'
import { TEAM_MANAGERS, normaliseTeam } from '@/lib/teams/structure'

const Body = z.object({ orgId: z.string().uuid(), team: z.record(z.string(), z.unknown()) })

async function gate(orgId: string) {
  const access = await authorizeOrgAccess(orgId, [...TEAM_MANAGERS])
  if (!access.success) return { response: access.response }
  if (!(await getSalesStructure(orgId)).teamsEnabled) return { response: NextResponse.json({ error: 'Team structure is switched off for this workspace (Settings → Sales structure).' }, { status: 403 }) }
  return { context: access.context }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success || !z.string().uuid().safeParse(teamId).success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const g = await gate(parsed.data.orgId); if ('response' in g) return g.response
  const { value, error } = normaliseTeam(parsed.data.team)
  if (error) return NextResponse.json({ error }, { status: 400 })
  const r = await saveTeam(parsed.data.orgId, teamId, value)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  await auditMember(request, g.context, parsed.data.orgId, 'team.updated', { type: 'team', id: teamId }, { name: value.name, leader: value.leaderProfileId, members: value.memberIds.length, projects: value.projectIds.length })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params
  const orgId = request.nextUrl.searchParams.get('orgId') ?? ''
  if (!z.string().uuid().safeParse(orgId).success || !z.string().uuid().safeParse(teamId).success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const g = await gate(orgId); if ('response' in g) return g.response
  const r = await deleteTeamStructure(orgId, teamId)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  await auditMember(request, g.context, orgId, 'team.deleted', { type: 'team', id: teamId }, {})
  return NextResponse.json({ ok: true })
}
