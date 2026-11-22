// app/api/plot-layouts/route.ts — upload a project's layout drawing (new, or a new drawing for an existing layout).
// Owners, admins and managers; inventory module on; the Interactive Plot Map add-on active for the project. The SVG is
// parsed into plain geometry on the server (lib/plots/svg.ts) and never stored as SVG.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { requireModule } from '@/lib/auth/entitlements'
import { requireProjectAddon } from '@/lib/plots/addons'
import { auditMember } from '@/lib/dal/org-audit'
import { saveLayout } from '@/lib/dal/plot-layouts'

const Schema = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid(),
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'Name the layout, e.g. “Phase 1”.').max(80),
  svg: z.string().min(1, 'Choose an SVG file.').max(3_200_000, 'The layout file is larger than 3 MB.'),
})

export async function POST(request: NextRequest) {
  const parsed = Schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid layout' }, { status: 400 })
  const { orgId, projectId, ...input } = parsed.data
  const access = await authorizeOrgAccess(orgId, ['owner', 'admin', 'manager'])
  if (!access.success) return access.response
  { const gate = await requireModule(orgId, 'inventory'); if (gate) return gate }
  { const gate = await requireProjectAddon(orgId, projectId, 'plot_maps'); if (gate) return gate }

  const result = await saveLayout(orgId, projectId, access.context.profile.id, input)
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status })
  await auditMember(request, access.context, orgId, 'plot_layout.uploaded', { type: 'plot_layout', id: result.data.id },
    { project_id: projectId, plots: result.data.plots, linked: result.data.report.links.length, new_layout: !input.id })
  return NextResponse.json(result.data, { status: input.id ? 200 : 201 })
}
