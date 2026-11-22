// app/api/plot-maps/versions/[versionId]/review/route.ts — move a map version through review:
// submit · qa_pass · qa_fail (managers and above) · approve · reject · publish (owners and admins: the developer's
// approval). Inventory on and the project's add-on active (lib/plots/gate.ts); the database enforces the order
// (plot_map_version_action). Every step is recorded in plot_map_reviews and the workspace audit log.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { gatePlotMapWrite } from '@/lib/plots/gate'
import { ACTION_ROLES, REVIEW_ACTIONS, versionAction, versionProjectId } from '@/lib/dal/plot-map-publishing'
import { auditMember } from '@/lib/dal/org-audit'

const Body = z.object({
  orgId: z.string().uuid(),
  action: z.enum(REVIEW_ACTIONS),
  comment: z.string().trim().max(1000).optional(),
}).strict()

export async function POST(request: NextRequest, { params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!z.string().uuid().safeParse(versionId).success || !parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { orgId, action, comment } = parsed.data
  const g = await gatePlotMapWrite(orgId, () => versionProjectId(orgId, versionId))
  if ('response' in g) return g.response
  if (!ACTION_ROLES[action].includes(g.context.role)) {
    return NextResponse.json({ error: 'Only the workspace owner or an admin can approve, send back or publish a map.' }, { status: 403 })
  }
  const r = await versionAction(orgId, versionId, g.context.profile.id, action, comment ?? null)
  if (!r.success) return NextResponse.json({ error: r.error }, { status: r.status })
  await auditMember(request, g.context, orgId, `plot_map.version_${action}`, { type: 'plot_map_version', id: versionId },
    { project_id: g.projectId, status: r.data.status, comment: comment ?? null })
  return NextResponse.json(r.data)
}
