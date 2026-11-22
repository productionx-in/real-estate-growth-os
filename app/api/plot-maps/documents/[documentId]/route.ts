// app/api/plot-maps/documents/[documentId]/route.ts
// POST → check the uploaded bytes (signature, size, SHA-256, PDF structure or image size); ready or failed with the
//        reason (a rejected file is deleted from storage). Audited.
// GET  → a two-minute signed link to the original, for the uploader's browser to show and render its pages.
// Owners, admins and managers; Inventory on; the project's add-on active.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { gatePlotMapWrite } from '@/lib/plots/gate'
import { completeDocumentUpload, originalReadUrl, projectOf } from '@/lib/dal/plot-map-documents'
import { auditMember } from '@/lib/dal/org-audit'

type Ctx = { params: Promise<{ documentId: string }> }
const uuid = z.string().uuid()

export async function POST(request: NextRequest, { params }: Ctx) {
  const { documentId } = await params
  const body = (await request.json().catch(() => null)) as { orgId?: unknown } | null
  const orgId = typeof body?.orgId === 'string' ? body.orgId : ''
  if (!uuid.safeParse(documentId).success || !uuid.safeParse(orgId).success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const g = await gatePlotMapWrite(orgId, () => projectOf(orgId, 'plot_map_documents', documentId))
  if ('response' in g) return g.response
  const r = await completeDocumentUpload(orgId, documentId)
  if (!r.success) return NextResponse.json({ error: r.error }, { status: r.status })
  await auditMember(request, g.context, orgId, r.data.status === 'ready' ? 'plot_map.document_accepted' : 'plot_map.document_rejected',
    { type: 'plot_map_document', id: documentId }, { project_id: g.projectId, pages: r.data.pages.length, reason: r.data.error })
  return NextResponse.json(r.data)
}

export async function GET(request: NextRequest, { params }: Ctx) {
  const { documentId } = await params
  const orgId = request.nextUrl.searchParams.get('orgId') ?? ''
  if (!uuid.safeParse(documentId).success || !uuid.safeParse(orgId).success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const g = await gatePlotMapWrite(orgId, () => projectOf(orgId, 'plot_map_documents', documentId))
  if ('response' in g) return g.response
  const url = await originalReadUrl(orgId, documentId)
  if (!url) return NextResponse.json({ error: 'The document is not available.' }, { status: 404 })
  return NextResponse.json({ url }, { headers: { 'Cache-Control': 'no-store' } })
}
