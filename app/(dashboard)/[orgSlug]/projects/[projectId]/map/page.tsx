// app/(dashboard)/[orgSlug]/projects/[projectId]/map/page.tsx — the project's interactive plot map (paid add-on).
// Everyone on the team sees published layouts; owners, admins and managers also upload, publish and share.
// Without the add-on the page explains what it is and who to ask — nothing of the feature is served.
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, MapPinned } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getModules } from '@/lib/auth/entitlements'
import { ADDONS, getAddon } from '@/lib/plots/addons'
import { getLiveLayout, listLayouts } from '@/lib/dal/plot-layouts'
import { createServiceClient } from '@/lib/supabase/server'
import { PlotMap } from '@/components/plots/PlotMap'
import { LayoutManager } from '@/components/plots/LayoutManager'
import { cn } from '@/lib/utils/cn'

export const metadata: Metadata = { title: 'Plot map' }
export const dynamic = 'force-dynamic'

export default async function ProjectMapPage({ params, searchParams }: {
  params: Promise<{ orgSlug: string; projectId: string }>
  searchParams: Promise<{ layout?: string; new?: string }>
}) {
  const { orgSlug, projectId } = await params
  const { layout: wanted, new: adding } = await searchParams
  const { org, isManager } = await getVerifiedWorkspace(orgSlug)
  const { data: project } = await createServiceClient().from('projects').select('id, name').eq('org_id', org.id).eq('id', projectId).maybeSingle()
  if (!project) notFound()
  const back = { href: `/${orgSlug}/projects/${projectId}`, label: project.name }

  const [addon, modules] = await Promise.all([getAddon(org.id, 'plot_maps'), getModules(org.id)])
  if (!addon.enabled || !modules.inventory) {
    return (
      <PageShell title="Plot map" description={project.name} back={back}>
        <div className="mx-auto max-w-xl rounded-xl border border-default bg-surface p-6 text-center shadow-2xs">
          <span className="mx-auto mb-3 grid size-12 place-items-center rounded-xl bg-brand-light text-brand"><MapPinned aria-hidden className="size-6" /></span>
          <h2 className="text-[16px] font-semibold text-foreground">{ADDONS.plot_maps.name} is an add-on</h2>
          <p className="mt-2 text-[13px] text-muted">{ADDONS.plot_maps.pitch}</p>
          <p className="mt-2 text-[13px] text-muted">We prepare the map from your approved layout plan and keep it up to date as the project changes. Ask your REGrow account manager to add it to this workspace.</p>
        </div>
      </PageShell>
    )
  }

  const all = await listLayouts(org.id, projectId)
  const visible = isManager ? all : all.filter((l) => l.status === 'published')
  const current = adding ? null : visible.find((l) => l.id === wanted) ?? visible[0] ?? null
  const live = current ? await getLiveLayout(org.id, current.id) : null

  return (
    <PageShell title="Plot map" description={`${project.name} · statuses update live from inventory`} back={back}>
      <div className="space-y-4">
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
        {isManager && <LayoutManager key={current?.id ?? 'new'} orgId={org.id} projectId={projectId} layout={current} />}
        {live ? (
          <PlotMap mode="team" viewBox={live.viewBox} geometry={live.geometry} plots={live.plots} showPrices unitHref={() => back.href} />
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
