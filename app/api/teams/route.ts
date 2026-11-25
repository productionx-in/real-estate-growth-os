// app/api/teams/route.ts — create a team (team structure, 20260097). Owners, admins and managers, while the workspace
// has team structure switched on (Settings → Sales structure). The database checks the leader and projects again.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { auditMember } from '@/lib/dal/org-audit'
import { getSalesStructure } from '@/lib/dal/sales-structure'
import { saveTeam } from '@/lib/dal/teams'
import { TEAM_MANAGERS, normaliseTeam } from '@/lib/teams/structure'

const Body = z.object({ orgId: z.string().uuid(), team: z.record(z.string(), z.unknown()) })

export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { orgId } = parsed.data
  const access = await authorizeOrgAccess(orgId, [...TEAM_MANAGERS])
  if (!access.success) return access.response
  if (!(await getSalesStructure(orgId)).teamsEnabled) return NextResponse.json({ error: 'Team structure is switched off for this workspace (Settings → Sales structure).' }, { status: 403 })
  const { value, error } = normaliseTeam(parsed.data.team)
  if (error) return NextResponse.json({ error }, { status: 400 })
  const r = await saveTeam(orgId, null, value)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  await auditMember(request, access.context, orgId, 'team.created', { type: 'team', id: r.id }, { name: value.name, leader: value.leaderProfileId, members: value.memberIds.length, projects: value.projectIds.length })
  return NextResponse.json({ ok: true, id: r.id }, { status: 201 })
}
