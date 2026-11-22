// app/api/plot-maps/versions/[versionId]/shapes/route.ts — the plot boundaries of a draft map version.
// GET → the editor's data (shapes, the project's unit numbers, a 10-minute link to the page image).
// PUT → save the whole set of shapes (validated on the server; only links a person confirmed are sent).
// Owners, admins and managers; Inventory on; the project's add-on active. Saves are rate-limited and audited.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { gatePlotMapWrite } from '@/lib/plots/gate'
import { getEditorData, saveShapes, versionProject } from '@/lib/dal/plot-map-shapes'
import { checkDistributedRateLimit } from '@/lib/integrations/webhooks/rate-limiter'
import { auditMember } from '@/lib/dal/org-audit'

type Ctx = { params: Promise<{ versionId: string }> }
const uuid = z.string().uuid()
const Point = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)])
const Body = z.object({
  orgId: z.string().uuid(),
  shapes: z.array(z.object({
    id: z.string().uuid().optional(),
    label: z.string().max(60),
    kind: z.enum(['polygon', 'rect']),
    points: z.array(Point).min(3).max(200),
    unitId: z.string().uuid().nullable(),
  }).strict()).max(2000),
}).strict()

export async function GET(request: NextRequest, { params }: Ctx) {
  const { versionId } = await params
  const orgId = request.nextUrl.searchParams.get('orgId') ?? ''
  if (!uuid.safeParse(versionId).success || !uuid.safeParse(orgId).success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const g = await gatePlotMapWrite(orgId, () => versionProject(orgId, versionId))
  if ('response' in g) return g.response
  const data = await getEditorData(orgId, versionId)
  if (!data) return NextResponse.json({ error: 'This version is not ready to edit.' }, { status: 404 })
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  const { versionId } = await params
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!uuid.safeParse(versionId).success || !parsed.success) return NextResponse.json({ error: parsed.success ? 'Invalid request' : (parsed.error.issues[0]?.message ?? 'Invalid plots') }, { status: 400 })
  const { orgId, shapes } = parsed.data
  const g = await gatePlotMapWrite(orgId, () => versionProject(orgId, versionId))
  if ('response' in g) return g.response
  const limit = await checkDistributedRateLimit({ key: `plotmap:shapes:user:${g.context.profile.id}`, limit: 30, windowMs: 60_000 })
  if (!limit.allowed) return NextResponse.json({ error: 'Saving too often. Please wait a moment.' }, { status: 429 })

  const r = await saveShapes(orgId, versionId, g.context.profile.id, shapes)
  if (!r.success) return NextResponse.json({ error: r.error }, { status: r.status })
  await auditMember(request, g.context, orgId, 'plot_map.shapes_saved', { type: 'plot_map_version', id: versionId }, {
    project_id: g.projectId, plots: r.data.saved, linked: shapes.filter((s) => s.unitId).length, overlaps: r.data.validation.overlaps.length,
  })
  return NextResponse.json(r.data)
}
