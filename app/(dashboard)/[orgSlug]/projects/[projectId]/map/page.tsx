// app/(dashboard)/[orgSlug]/projects/[projectId]/map/page.tsx — the project's Interactive Plot Map (paid add-on,
// activated per project: lib/plots/addons.ts). States:
//   not activated → what it is, and "Request activation" for owners/admins;   pending → request recorded;
//   active, no layout yet → set-up steps and upload;   active → the map (managers+ see set-up progress until published);
//   suspended / expired → the status and reason; nothing of the feature is served (layouts are kept).
// Everyone on the team sees published layouts; owners, admins and managers also upload, publish and share.
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, MapPinned } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getModules } from '@/lib/auth/entitlements'
import { ADDONS, STATE_INFO, getProjectAddon } from '@/lib/plots/addons'
import { RequestActivationButton } from '@/components/plots/RequestActivationButton'
import { Badge } from '@/components/ui'
import { getLiveLayout, listLayouts } from '@/lib/dal/plot-layouts'
import { createServiceClient } from '@/lib/supabase/server'
import { PlotMap } from '@/components/plots/PlotMap'
import { AutoRefresh } from '@/components/plots/AutoRefresh'
import { LayoutManager } from '@/components/plots/LayoutManager'
import { MapDocuments } from '@/components/plots/MapDocuments'
import { listMapFiles } from '@/lib/dal/plot-map-documents'
import { listReviews } from '@/lib/dal/plot-map-publishing'
import { cn } from '@/lib/utils/cn'
import { getSetupView } from '@/lib/dal/plot-map-setup'
import { SetupProgress } from '@/components/plots/SetupProgress'
import { StaffDrawingAccess } from '@/components/plots/StaffDrawingAccess'
import { getStaffAccess } from '@/lib/dal/plot-map-staff'

export const metadata: Metadata = { title: 'Plot map' }
export const dynamic = 'force-dynamic'

export default async function ProjectMapPage({ params, searchParams }: {
  params: Promise<{ orgSlug: string; projectId: string }>
  searchParams: Promise<{ layout?: string; new?: string }>
}) {
  const { orgSlug, projectId } = await params
  const { layout: wanted, new: adding } = await searchParams
  const { org, isManager, isAdmin } = await getVerifiedWorkspace(orgSlug)
  const { data: project } = await createServiceClient().from('projects').select('id, name').eq('org_id', org.id).eq('id', projectId).maybeSingle()
  if (!project) notFound()
  const back = { href: `/${orgSlug}/projects/${projectId}`, label: project.name }

  const [addon, modules] = await Promise.all([getProjectAddon(org.id, projectId, 'plot_maps'), getModules(org.id)])
  const day = (iso: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(iso))
  if (addon.state !== 'active' || !modules.inventory) {
    const info = STATE_INFO[addon.state]
    return (
      <PageShell title="Plot map" description={project.name} back={back}>
        <div className="mx-auto max-w-xl space-y-3 rounded-xl border border-default bg-surface p-6 text-center shadow-2xs">
          <span className="mx-auto grid size-12 place-items-center rounded-xl bg-brand-light text-brand"><MapPinned aria-hidden className="size-6" /></span>
          <h2 className="text-[16px] font-semibold text-foreground">{ADDONS.plot_maps.name}</h2>
          <Badge tone={info.tone}>{info.label}</Badge>
          {!modules.inventory ? (
            <p className="text-[13px] text-muted">The plot map shows your inventory, so the Inventory module must be switched on for this workspace.</p>
          ) : addon.state === 'not_purchased' ? (
            <>
              <p className="text-[13px] text-muted">{ADDONS.plot_maps.pitch}</p>
              <p className="text-[13px] text-muted">It is activated per project. Upload your approved layout (PDF or image); each plot is linked to its unit in your inventory, so the map is always current.</p>
              {isAdmin ? <div className="flex justify-center"><RequestActivationButton orgId={org.id} projectId={projectId} /></div>
                : <p className="text-[13px] text-muted">Ask your workspace owner or admin to request it.</p>}
            </>
          ) : (
            <>
              <p className="text-[13px] text-muted">{info.customer}</p>
              {addon.state === 'pending' && addon.requestedAt && <p className="text-[12px] text-subtle">Requested on {day(addon.requestedAt)}.</p>}
              {(addon.state === 'suspended' || addon.state === 'expired') && addon.statusReason && <p className="text-[12px] text-subtle">Reason: {addon.statusReason}</p>}
              {addon.state === 'expired' && addon.validUntil && <p className="text-[12px] text-subtle">Ended on {day(addon.validUntil)}.</p>}
              {addon.state === 'expired' && isAdmin && <div className="flex justify-center"><RequestActivationButton orgId={org.id} projectId={projectId} renewal /></div>}
            </>
          )}
        </div>
      </PageShell>
    )
  }

  const all = await listLayouts(org.id, projectId)
  const visible = isManager ? all : all.filter((l) => l.status === 'published')
  const current = adding ? null : visible.find((l) => l.id === wanted) ?? visible[0] ?? null
  const live = current ? await getLiveLayout(org.id, current.id) : null
  const files = isManager ? await listMapFiles(org.id, projectId) : null
  const reviewList = isManager ? await listReviews(org.id, projectId) : []
  const setup = isManager ? await getSetupView(org.id, projectId) : null
  const staffAccess = isAdmin ? await getStaffAccess(org.id, projectId) : null
  const reviews: Record<string, { action: string; comment: string | null; actorName: string | null; at: string }[]> = {}
  for (const r of reviewList) (reviews[r.versionId] ??= []).push(r)

  return (
    <PageShell title="Plot map" description={`${project.name} · statuses update live from inventory${addon.validUntil ? ` · active until ${day(addon.validUntil)}` : ''}`} back={back}>
      <div className="space-y-4">
        {setup && setup.completed < setup.stages.length && <SetupProgress view={setup} orgId={org.id} canAct={isManager} />}
        {isAdmin && setup && !setup.stages.find((s) => s.key === 'mapped')?.completedAt && (
          <StaffDrawingAccess orgId={org.id} projectId={projectId} access={staffAccess ? { expiresAt: staffAccess.expiresAt, grantedBy: staffAccess.grantedBy } : null} />
        )}
        {isManager && all.length === 0 && !adding && (
          <section aria-label="Set up your map" className="rounded-xl border border-default bg-surface p-5 shadow-2xs">
            <h2 className="text-[15px] font-semibold text-foreground">Set up your plot map</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] text-muted">
              <li>Upload the approved layout of this project (or one phase) as a PDF, PNG or JPG, and choose the page.</li>
              <li>Plot boundaries are drawn on it and each plot is linked to its unit in your inventory — you confirm every link.</li>
              <li>Approve and publish the map for your team, then share the buyer link when you’re ready.</li>
            </ol>
          </section>
        )}
        {(visible.length > 1 || isManager) && (
          <nav aria-label="Layouts" className="flex flex-wrap items-center gap-1.5">
            {visible.map((l) => (
              <Link key={l.id} href={`?layout=${l.id}`} aria-current={current?.id === l.id ? 'page' : undefined}
                className={cn('inline-flex min-h-9 items-center rounded-full border px-3 text-[13px]', current?.id === l.id ? 'border-brand bg-brand-light font-medium text-brand' : 'border-default text-foreground hover:bg-surface-hover')}>
                {l.name}{l.status === 'draft' && <span className="ml-1.5 text-[11px] text-muted">draft</span>}
              </Link>
            ))}
            {isManager && <Link href="?new=1" className={cn('inline-flex min-h-9 items-center rounded-full border border-dashed px-3 text-[13px]', adding ? 'border-brand text-brand' : 'border-strong text-muted hover:bg-surface-hover')}>+ Add a layout (phase)</Link>}
          </nav>
        )}
        {files && <MapDocuments orgId={org.id} orgSlug={orgSlug} projectId={projectId} layouts={all.map((l) => ({ id: l.id, name: l.name }))} documents={files.documents} versions={files.versions} canApprove={isAdmin} reviews={reviews} />}
        {isManager && <LayoutManager key={current?.id ?? 'new'} orgId={org.id} projectId={projectId} layout={current} />}
        {live ? (
          <><AutoRefresh seconds={30} /><PlotMap mode="team" viewBox={live.viewBox} geometry={live.geometry} plots={live.plots} showPrices unitHref={() => back.href} image={live.image} /></>
        ) : !isManager && (
          <div className="rounded-xl border border-dashed border-default p-8 text-center text-[13px] text-muted">
            <Link href={back.href} className="inline-flex items-center gap-1 font-medium text-brand"><ArrowLeft aria-hidden className="size-3.5" /> Back to the project</Link>
            <p className="mt-2">No plot map has been published for this project yet.</p>
          </div>
        )}
      </div>
    </PageShell>
  )
}
