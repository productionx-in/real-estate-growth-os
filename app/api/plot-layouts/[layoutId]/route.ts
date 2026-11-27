// app/api/plot-layouts/[layoutId]/route.ts — publish or unpublish a layout, turn its public link on or off (or issue
// a new one), show or hide prices on it, set which way north points (compass), choose the websites that may embed it, rename it, or delete it. Owners, admins and managers; the project's add-on
// must be active, except to take the map offline (unpublish, link off, delete).
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { requireModule } from '@/lib/auth/entitlements'
import { requireProjectAddon } from '@/lib/plots/addons'
import { auditMember } from '@/lib/dal/org-audit'
import { deleteLayout, layoutProject, rotateShareLink, updateLayout } from '@/lib/dal/plot-layouts'

const Patch = z.object({
  orgId: z.string().uuid(),
  publish: z.boolean().optional(),
  share: z.boolean().optional(),
  showPrices: z.boolean().optional(),
  northDeg: z.number().int().min(0).max(359).optional(),
  name: z.string().trim().min(1).max(80).optional(),
  newLink: z.literal(true).optional(),
  embedDomains: z.array(z.string().max(300)).max(20).optional(),
})

/** Authorise, then (unless the change only takes the map offline) require the project's add-on to be active.
 *  Unpublishing, turning the link off and deleting stay possible in every state, so a lapsed map can go offline. */
async function gate(orgId: string, layoutId: string, takesOffline: boolean) {
  const access = await authorizeOrgAccess(orgId, ['owner', 'admin', 'manager'])
  if (!access.success) return { response: access.response }
  const m = await requireModule(orgId, 'inventory'); if (m) return { response: m }
  const projectId = await layoutProject(orgId, layoutId)
  if (!projectId) return { response: NextResponse.json({ error: 'Layout not found.' }, { status: 404 }) }
  if (!takesOffline) { const a = await requireProjectAddon(orgId, projectId, 'plot_maps'); if (a) return { response: a } }
  return { context: access.context }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ layoutId: string }> }) {
  const { layoutId } = await params
  const parsed = Patch.safeParse(await request.json().catch(() => null))
  if (!z.string().uuid().safeParse(layoutId).success || !parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { orgId, newLink, ...change } = parsed.data
  const takesOffline = !newLink && change.name === undefined && change.showPrices === undefined && change.northDeg === undefined && change.embedDomains === undefined && change.publish !== true && change.share !== true
  const g = await gate(orgId, layoutId, takesOffline)
  if (g.response) return g.response
  if (newLink && !(await rotateShareLink(orgId, layoutId))) return NextResponse.json({ error: 'Layout not found.' }, { status: 404 })
  const result = await updateLayout(orgId, layoutId, g.context!.profile.id, change)
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status })
  await auditMember(request, g.context!, orgId, 'plot_layout.updated', { type: 'plot_layout', id: layoutId }, { ...change, new_link: newLink === true })
  return NextResponse.json({ layout: result.data })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ layoutId: string }> }) {
  const { layoutId } = await params
  const orgId = request.nextUrl.searchParams.get('orgId') ?? ''
  if (!z.string().uuid().safeParse(layoutId).success || !z.string().uuid().safeParse(orgId).success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const g = await gate(orgId, layoutId, true)
  if (g.response) return g.response
  if (!(await deleteLayout(orgId, layoutId))) return NextResponse.json({ error: 'Layout not found.' }, { status: 404 })
  await auditMember(request, g.context!, orgId, 'plot_layout.deleted', { type: 'plot_layout', id: layoutId }, {})
  return NextResponse.json({ ok: true })
}
