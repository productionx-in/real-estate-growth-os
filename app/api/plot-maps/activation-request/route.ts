// app/api/plot-maps/activation-request/route.ts — a workspace owner or admin asks RE by PX to activate (or renew) the
// Interactive Plot Map add-on for one project. It only records a `pending` request: activation itself is a Platform
// Owner action (app/api/admin/project-addons). Never changes an active or suspended entitlement. Audited.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { requireModule } from '@/lib/auth/entitlements'
import { auditMember } from '@/lib/dal/org-audit'
import { createServiceClient } from '@/lib/supabase/server'
import { getProjectAddon, STATE_INFO } from '@/lib/plots/addons'

const Body = z.object({ orgId: z.string().uuid(), projectId: z.string().uuid() }).strict()

export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { orgId, projectId } = parsed.data
  const access = await authorizeOrgAccess(orgId, ['owner', 'admin'])
  if (!access.success) return access.response
  { const gate = await requireModule(orgId, 'inventory'); if (gate) return gate }

  const db = createServiceClient()
  const { data: project } = await db.from('projects').select('id').eq('org_id', orgId).eq('id', projectId).maybeSingle()
  if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 })

  const current = await getProjectAddon(orgId, projectId, 'plot_maps')
  if (current.state === 'pending') return NextResponse.json({ ok: true, state: 'pending' })
  if (current.state === 'active' || current.state === 'suspended') {
    return NextResponse.json({ error: STATE_INFO[current.state].customer, state: current.state }, { status: 409 })
  }

  const now = new Date().toISOString()
  const fields = { status: 'pending' as const, requested_by: access.context.profile.id, requested_at: now, status_reason: current.state === 'expired' ? 'Renewal requested' : 'Activation requested', updated_by: access.context.user.id }
  const { error } = current.state === 'expired'
    ? await db.from('project_addons').update(fields).eq('org_id', orgId).eq('project_id', projectId).eq('addon', 'plot_maps')
    : await db.from('project_addons').insert({ ...fields, org_id: orgId, project_id: projectId, addon: 'plot_maps' })
  if (error?.code === '23505') return NextResponse.json({ ok: true, state: 'pending' }) // a concurrent request won
  if (error) return NextResponse.json({ error: 'Could not send the request.' }, { status: 500 })

  await auditMember(request, access.context, orgId, 'plot_map.activation_requested', { type: 'project', id: projectId }, { renewal: current.state === 'expired' })
  return NextResponse.json({ ok: true, state: 'pending' }, { status: 201 })
}
