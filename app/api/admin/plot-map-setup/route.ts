// app/api/admin/plot-map-setup/route.ts — RE by PX's operations on a project's Interactive Plot Map set-up: assign a
// team member, raise a blocker (waiting on the customer — which pauses the service clock and tells the customer — or
// on RE by PX), resolve a blocker. Staff with CAN.plotMapSetup, with MFA; audited in the platform log. Touches set-up
// metadata only: never the customer's map, inventory or buyers.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authenticatePlatformAdmin, logPlatformAction } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'
import { CAN } from '@/lib/platform/portal'
import { assignSetup, raiseBlocker, resolveBlocker } from '@/lib/dal/plot-map-setup'

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('assign'), orgId: z.string().uuid(), projectId: z.string().uuid(), assigneeUserId: z.string().uuid().nullable() }).strict(),
  z.object({ action: z.literal('raise'), orgId: z.string().uuid(), projectId: z.string().uuid(),
    stage: z.enum(['uploaded', 'processed', 'mapped', 'linked', 'qa', 'approved', 'published']), waitingOn: z.enum(['customer', 'regrow']),
    reason: z.string().trim().min(5).max(500) }).strict(),
  z.object({ action: z.literal('resolve'), orgId: z.string().uuid(), blockerId: z.string().uuid(), resolution: z.string().trim().max(500).optional() }).strict(),
])

export async function POST(request: NextRequest) {
  const a = await authenticatePlatformAdmin([...CAN.plotMapSetup], true)
  if (!a.success) return a.response
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  const b = parsed.data
  const db = createServiceClient()
  if (b.action !== 'resolve') {
    const { data: p } = await db.from('projects').select('id').eq('org_id', b.orgId).eq('id', b.projectId).maybeSingle()
    if (!p) return NextResponse.json({ error: 'Project not found in this workspace.' }, { status: 404 })
  }
  const r = b.action === 'assign' ? await assignSetup(b.orgId, b.projectId, b.assigneeUserId, a.auth.user.id)
    : b.action === 'raise' ? await raiseBlocker(b.orgId, b.projectId, a.auth.user.id, { stage: b.stage, waitingOn: b.waitingOn, reason: b.reason })
    : await resolveBlocker(b.orgId, b.blockerId, a.auth.user.id, b.resolution ?? null)
  if (!r.success) return NextResponse.json({ error: r.error }, { status: r.status })
  await logPlatformAction({
    actorUserId: a.auth.user.id, actorRole: a.auth.platformUser.role, action: `plot_map_setup.${b.action}`,
    targetEntityType: b.action === 'resolve' ? 'plot_map_blocker' : 'project', targetEntityId: b.action === 'resolve' ? b.blockerId : b.projectId,
    metadata: { org_id: b.orgId, ...(b.action === 'raise' ? { stage: b.stage, waiting_on: b.waitingOn } : {}), ...(b.action === 'assign' ? { assignee: b.assigneeUserId } : {}) },
  })
  return NextResponse.json({ ok: true })
}
