// app/api/admin/plot-maps/versions/[versionId]/shapes/route.ts — REGrow staff draw plot boundaries on a customer's
// draft map version (option c), only while that workspace allows it for the project (20260085).
// GET → the page image (10-minute link) and the outlines; linked plots are only marked as linked, never which unit.
// PUT → save outlines and plot numbers; save_plot_map_shapes_as_staff() keeps the customer's links and makes none.
// Staff with CAN.plotMapSetup, with MFA; saves are rate-limited and audited in the platform log.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authenticatePlatformAdmin, logPlatformAction } from '@/lib/auth/platform'
import { CAN } from '@/lib/platform/portal'
import { saveShapesAsStaff, staffEditorData, staffProfileId } from '@/lib/dal/plot-map-staff'
import { checkDistributedRateLimit } from '@/lib/integrations/webhooks/rate-limiter'

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
  }).strict()).max(2000),
}).strict()

export async function GET(request: NextRequest, { params }: Ctx) {
  const a = await authenticatePlatformAdmin([...CAN.plotMapSetup], true)
  if (!a.success) return a.response
  const { versionId } = await params
  const orgId = request.nextUrl.searchParams.get('orgId') ?? ''
  if (!uuid.safeParse(versionId).success || !uuid.safeParse(orgId).success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const data = await staffEditorData(orgId, versionId)
  if (!data) return NextResponse.json({ error: 'Not available: the workspace has not allowed REGrow to draw, or the page is not ready.' }, { status: 404 })
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  const a = await authenticatePlatformAdmin([...CAN.plotMapSetup], true)
  if (!a.success) return a.response
  const { versionId } = await params
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!uuid.safeParse(versionId).success || !parsed.success) return NextResponse.json({ error: parsed.success ? 'Invalid request' : (parsed.error.issues[0]?.message ?? 'Invalid plots') }, { status: 400 })
  const limit = await checkDistributedRateLimit({ key: `plotmap:staff-shapes:${a.auth.user.id}`, limit: 30, windowMs: 60_000 })
  if (!limit.allowed) return NextResponse.json({ error: 'Saving too often. Please wait a moment.' }, { status: 429 })
  const { orgId, shapes } = parsed.data
  const r = await saveShapesAsStaff(orgId, versionId, await staffProfileId(a.auth.user.id), shapes)
  if (!r.success) return NextResponse.json({ error: r.error }, { status: r.status })
  await logPlatformAction({
    actorUserId: a.auth.user.id, actorRole: a.auth.platformUser.role, action: 'plot_map.staff_shapes_saved',
    targetEntityType: 'plot_map_version', targetEntityId: versionId, metadata: { org_id: orgId, plots: r.data.saved, overlaps: r.data.overlaps },
  })
  return NextResponse.json({ ok: true, saved: r.data.saved })
}
