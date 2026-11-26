// app/api/plot-maps/staff-access/route.ts — the workspace lets RE by PX draw the plot boundaries of one project (option
// c), or withdraws that. Owners and admins; Inventory on; giving it needs the project's add-on active (withdrawing
// never does). RE by PX never sees inventory, prices or buyers, and cannot link plots to units. Audited.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { requireModule } from '@/lib/auth/entitlements'
import { requireProjectAddon } from '@/lib/plots/addons'
import { createServiceClient } from '@/lib/supabase/server'
import { auditMember } from '@/lib/dal/org-audit'
import { grantStaffAccess, revokeStaffAccess, STAFF_ACCESS_MAX_DAYS } from '@/lib/dal/plot-map-staff'

const Body = z.object({ orgId: z.string().uuid(), projectId: z.string().uuid(), days: z.number().int().min(1).max(STAFF_ACCESS_MAX_DAYS).optional() }).strict()

async function gate(request: NextRequest, giving: boolean) {
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return { response: NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
  const { orgId, projectId } = parsed.data
  const access = await authorizeOrgAccess(orgId, ['owner', 'admin'])
  if (!access.success) return { response: access.response }
  const m = await requireModule(orgId, 'inventory'); if (m) return { response: m }
  const { data: p } = await createServiceClient().from('projects').select('id').eq('org_id', orgId).eq('id', projectId).maybeSingle()
  if (!p) return { response: NextResponse.json({ error: 'Project not found.' }, { status: 404 }) }
  if (giving) { const a = await requireProjectAddon(orgId, projectId, 'plot_maps'); if (a) return { response: a } }
  return { context: access.context, body: parsed.data }
}

export async function POST(request: NextRequest) {
  const g = await gate(request, true)
  if (g.response) return g.response
  const { orgId, projectId, days } = g.body!
  const r = await grantStaffAccess(orgId, projectId, g.context!.profile.id, days)
  if (!r.success) return NextResponse.json({ error: r.error }, { status: r.status })
  await auditMember(request, g.context!, orgId, 'plot_map.staff_drawing_allowed', { type: 'project', id: projectId }, { expires_at: r.data.expiresAt })
  return NextResponse.json({ access: r.data })
}

export async function DELETE(request: NextRequest) {
  const g = await gate(request, false)
  if (g.response) return g.response
  const { orgId, projectId } = g.body!
  const r = await revokeStaffAccess(orgId, projectId, g.context!.profile.id)
  if (!r.success) return NextResponse.json({ error: r.error }, { status: r.status })
  await auditMember(request, g.context!, orgId, 'plot_map.staff_drawing_withdrawn', { type: 'project', id: projectId }, {})
  return NextResponse.json({ ok: true })
}
