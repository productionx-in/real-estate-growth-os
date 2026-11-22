// app/api/plot-maps/versions/[versionId]/route.ts — finish a version's render, or retry it.
// { action: 'complete' } → the server checks the uploaded page PNG and thumbnail (signature, exact size, limits).
// { action: 'retry' }    → new one-time upload URLs for a render that failed or never arrived (same version).
// Owners, admins and managers; Inventory on; the project's add-on active.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { gatePlotMapWrite } from '@/lib/plots/gate'
import { completeVersion, projectOf, retryVersionUpload } from '@/lib/dal/plot-map-documents'
import { auditMember } from '@/lib/dal/org-audit'

const Body = z.object({ orgId: z.string().uuid(), action: z.enum(['complete', 'retry']) }).strict()

export async function POST(request: NextRequest, { params }: { params: Promise<{ versionId: string }> }) {
  const { versionId } = await params
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!z.string().uuid().safeParse(versionId).success || !parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { orgId, action } = parsed.data
  const g = await gatePlotMapWrite(orgId, () => projectOf(orgId, 'plot_map_versions', versionId))
  if ('response' in g) return g.response

  if (action === 'retry') {
    const r = await retryVersionUpload(orgId, versionId)
    if (!r.success) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json(r.data)
  }
  const r = await completeVersion(orgId, versionId)
  if (!r.success) return NextResponse.json({ error: r.error }, { status: r.status })
  await auditMember(request, g.context, orgId, r.data.status === 'ready' ? 'plot_map.version_rendered' : 'plot_map.version_render_failed',
    { type: 'plot_map_version', id: versionId }, { project_id: g.projectId, reason: r.data.error })
  return NextResponse.json(r.data)
}
