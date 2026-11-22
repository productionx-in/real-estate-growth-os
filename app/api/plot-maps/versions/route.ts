// app/api/plot-maps/versions/route.ts — make a new draft map version from one page of a checked document, at a
// rotation. The server decides the exact render size; the browser renders the page to that size and uploads the PNG
// and thumbnail through the returned one-time URLs, then calls POST /api/plot-maps/versions/[id] to have them checked.
// A new version never changes an existing (or published) one. Owners, admins and managers; add-on active. Audited.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { gatePlotMapWrite } from '@/lib/plots/gate'
import { createVersion, projectOf } from '@/lib/dal/plot-map-documents'
import { checkDistributedRateLimit } from '@/lib/integrations/webhooks/rate-limiter'
import { auditMember } from '@/lib/dal/org-audit'

const Body = z.object({
  orgId: z.string().uuid(),
  documentId: z.string().uuid(),
  page: z.number().int().min(1).max(20),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  width: z.number().int().min(1).max(8192),
  height: z.number().int().min(1).max(8192),
  renderer: z.string().min(1).max(40),
  rendererVersion: z.string().min(1).max(20),
}).strict()

export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  const { orgId, documentId, ...input } = parsed.data
  const g = await gatePlotMapWrite(orgId, () => projectOf(orgId, 'plot_map_documents', documentId))
  if ('response' in g) return g.response
  const limit = await checkDistributedRateLimit({ key: `plotmap:render:user:${g.context.profile.id}`, limit: 10, windowMs: 60_000 })
  if (!limit.allowed) return NextResponse.json({ error: 'Please wait a minute before preparing another version.' }, { status: 429 })

  const r = await createVersion(orgId, documentId, g.context.profile.id, input)
  if (!r.success) return NextResponse.json({ error: r.error }, { status: r.status })
  await auditMember(request, g.context, orgId, 'plot_map.version_created', { type: 'plot_map_version', id: r.data.versionId },
    { project_id: g.projectId, document_id: documentId, version_no: r.data.versionNo, page: input.page, rotation: input.rotation })
  return NextResponse.json(r.data, { status: 201 })
}
