// app/api/plot-maps/setup/blockers/[blockerId]/route.ts — the workspace marks a set-up blocker that was waiting on it
// as done (e.g. "upload the approved layout"). Owners, admins and managers; Inventory on; the project's add-on active.
// Only blockers waiting on the customer can be resolved here — REGrow's own blockers are resolved by REGrow. Audited.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { gatePlotMapWrite } from '@/lib/plots/gate'
import { resolveBlocker } from '@/lib/dal/plot-map-setup'
import { createServiceClient } from '@/lib/supabase/server'
import { auditMember } from '@/lib/dal/org-audit'

const Body = z.object({ orgId: z.string().uuid(), resolution: z.string().trim().max(500).optional() }).strict()

export async function POST(request: NextRequest, { params }: { params: Promise<{ blockerId: string }> }) {
  const { blockerId } = await params
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!z.string().uuid().safeParse(blockerId).success || !parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { orgId, resolution } = parsed.data
  const { data: b } = await createServiceClient().from('plot_map_setup_blockers').select('project_id, waiting_on').eq('org_id', orgId).eq('id', blockerId).maybeSingle()
  const g = await gatePlotMapWrite(orgId, async () => b?.project_id ?? null)
  if ('response' in g) return g.response
  if (b?.waiting_on !== 'customer') return NextResponse.json({ error: 'REGrow will close this one when it is done.' }, { status: 403 })
  const r = await resolveBlocker(orgId, blockerId, g.context.user.id, resolution ?? null)
  if (!r.success) return NextResponse.json({ error: r.error }, { status: r.status })
  await auditMember(request, g.context, orgId, 'plot_map.blocker_resolved', { type: 'project', id: g.projectId }, { blocker_id: blockerId })
  return NextResponse.json({ ok: true })
}
