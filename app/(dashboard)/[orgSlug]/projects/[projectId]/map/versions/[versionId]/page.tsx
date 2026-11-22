// app/(dashboard)/[orgSlug]/projects/[projectId]/map/versions/[versionId]/page.tsx — draw the plot boundaries of a
// map version and link each plot to its inventory unit (components/plots/ShapeEditor.tsx). Owners, admins and
// managers, Inventory on, the project's add-on active — the same checks as every map write route. A version that is
// no longer a draft opens read-only.
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { PageShell } from '@/components/layout/PageShell'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getModules } from '@/lib/auth/entitlements'
import { getProjectAddon } from '@/lib/plots/addons'
import { getEditorData } from '@/lib/dal/plot-map-shapes'
import { createServiceClient } from '@/lib/supabase/server'
import { ShapeEditor } from '@/components/plots/ShapeEditor'
import { Alert } from '@/components/ui'

export const metadata: Metadata = { title: 'Draw plots' }
export const dynamic = 'force-dynamic'

export default async function MapVersionEditorPage({ params }: { params: Promise<{ orgSlug: string; projectId: string; versionId: string }> }) {
  const { orgSlug, projectId, versionId } = await params
  if (![projectId, versionId].every((v) => /^[0-9a-f-]{36}$/i.test(v))) notFound()
  const { org, isManager } = await getVerifiedWorkspace(orgSlug)
  const mapHref = `/${orgSlug}/projects/${projectId}/map`
  if (!isManager) redirect(mapHref)
  const [addon, modules] = await Promise.all([getProjectAddon(org.id, projectId, 'plot_maps'), getModules(org.id)])
  if (addon.state !== 'active' || !modules.inventory) redirect(mapHref)
  const { data: v } = await createServiceClient().from('plot_map_versions').select('project_id').eq('org_id', org.id).eq('id', versionId).maybeSingle()
  if (!v || v.project_id !== projectId) notFound()
  const data = await getEditorData(org.id, versionId)
  if (!data) notFound()
  const title = `${data.version.layoutName} · version ${data.version.versionNo}`
  return (
    <PageShell title="Draw plots" description={`${title} · draw each plot and link it to its inventory unit`} back={{ href: mapHref, label: 'Plot map' }}>
      {!data.imageUrl ? <Alert tone="danger">The page image could not be loaded. Please reload.</Alert>
        : !data.editable ? <Alert tone="info">This version is {data.version.status.replace('_', ' ')} and can no longer be changed. Prepare a new version to make changes.</Alert>
        : <ShapeEditor orgId={org.id} versionId={versionId} width={data.version.width} height={data.version.height} imageUrl={data.imageUrl}
            initialShapes={data.shapes} units={data.units} title={title} />}
    </PageShell>
  )
}
