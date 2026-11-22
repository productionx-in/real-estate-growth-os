// app/api/plot-maps/documents/route.ts — start uploading a layout document (PDF, PNG or JPG) for a project's map.
// Owners, admins and managers; Inventory on; the project's Interactive Plot Map add-on active. Returns a one-time
// signed URL for the private bucket: the file goes straight to storage and is checked on "complete".
// Rate-limited per person and per project. Audited.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { gatePlotMapWrite } from '@/lib/plots/gate'
import { startDocumentUpload } from '@/lib/dal/plot-map-documents'
import { checkDistributedRateLimit } from '@/lib/integrations/webhooks/rate-limiter'
import { auditMember } from '@/lib/dal/org-audit'

const Body = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid(),
  layoutId: z.string().uuid().optional(),
  layoutName: z.string().trim().min(1).max(80).optional(),
  fileName: z.string().min(1).max(255),
  mime: z.string().min(1).max(100),
  size: z.number().int().positive(),
}).strict().refine((b) => b.layoutId || b.layoutName, { message: 'Choose a map or name a new one.' })

export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  const { orgId, projectId, ...input } = parsed.data
  const g = await gatePlotMapWrite(orgId, async () => projectId)
  if ('response' in g) return g.response

  const perPerson = await checkDistributedRateLimit({ key: `plotmap:upload:user:${g.context.profile.id}`, limit: 3, windowMs: 60_000 })
  const perProject = await checkDistributedRateLimit({ key: `plotmap:upload:project:${projectId}`, limit: 20, windowMs: 86_400_000 })
  if (!perPerson.allowed || !perProject.allowed) {
    return NextResponse.json({ error: perPerson.allowed ? 'This project has had 20 uploads today. Please try again tomorrow.' : 'Please wait a minute before uploading again.' }, { status: 429 })
  }

  const r = await startDocumentUpload(orgId, projectId, g.context.profile.id, input)
  if (!r.success) return NextResponse.json({ error: r.error }, { status: r.status })
  await auditMember(request, g.context, orgId, 'plot_map.document_upload_started', { type: 'plot_map_document', id: r.data.documentId },
    { project_id: projectId, layout_id: r.data.layoutId, size: input.size, mime: r.data.mime })
  return NextResponse.json(r.data, { status: 201 })
}
