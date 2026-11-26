// app/platform/plot-maps/[orgId]/[projectId]/[versionId]/page.tsx — RE staff draw plot outlines and numbers on a
// customer's draft version (option c). The editor runs in draw-only mode: no units are shown or sent, and the
// database keeps the customer's links (save_plot_map_shapes_as_staff). Only while the workspace allows it.
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { getConsoleAccess } from '@/lib/auth/platform'
import { can, type StaffRole } from '@/lib/platform/portal'
import { staffEditorData } from '@/lib/dal/plot-map-staff'
import { Alert } from '@/components/ui'
import { ShapeEditor } from '@/components/plots/ShapeEditor'

export const metadata: Metadata = { title: 'Draw plot boundaries' }
export const dynamic = 'force-dynamic'

export default async function StaffDrawPage({ params }: { params: Promise<{ orgId: string; projectId: string; versionId: string }> }) {
  const access = await getConsoleAccess()
  if (access.state !== 'ok') return null
  if (!can(access.role as StaffRole, 'plotMapSetup')) return <Alert tone="warning">Only the Platform Owner, platform admins and support work on map set-ups.</Alert>
  const { orgId, projectId, versionId } = await params
  if (![orgId, projectId, versionId].every((x) => z.string().uuid().safeParse(x).success)) notFound()
  const data = await staffEditorData(orgId, versionId)
  const back = <Link href={`/platform/plot-maps/${orgId}/${projectId}`} className="text-[13px] font-medium text-brand hover:underline">Back to the project</Link>
  if (!data || data.version.projectId !== projectId) return <div className="space-y-3"><Alert tone="info">Not available: the workspace has not allowed RE to draw, or the page is not ready.</Alert>{back}</div>
  if (!data.editable) return <div className="space-y-3"><Alert tone="info">This version is in review or later, so it can no longer be changed.</Alert>{back}</div>
  if (!data.imageUrl) return <div className="space-y-3"><Alert tone="danger">The layout page could not be loaded. Try again in a moment.</Alert>{back}</div>
  return (
    <div className="space-y-3">
      {back}
      <ShapeEditor drawOnly endpoint={`/api/admin/plot-maps/versions/${versionId}/shapes`}
        orgId={orgId} versionId={versionId} width={data.version.width} height={data.version.height} imageUrl={data.imageUrl}
        initialShapes={data.shapes} units={[]} title={`${data.version.layoutName} · v${data.version.versionNo}`} />
      <p className="text-[12px] text-muted">Plot numbers you change on a linked plot drop that link; the customer confirms it again.</p>
    </div>
  )
}
