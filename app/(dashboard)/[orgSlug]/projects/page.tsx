// app/(dashboard)/[orgSlug]/projects/page.tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus, FolderOpen, Building2, MapPin } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/server'
import { PageShell } from '@/components/layout/PageShell'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatDate } from '@/lib/utils/format'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { ProjectCardMenu } from '@/components/projects/ProjectCardMenu'
import { PROJECT_CATEGORY_LABELS, type ProjectCategory } from '@/types/inventory'

export const metadata: Metadata = { title: 'Projects' }
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ orgSlug: string }>
}

const STATUS_LABEL: Record<string, string> = {
  planning: 'Planning',
  pre_launch: 'Pre-launch',
  launched: 'Launched',
  ongoing: 'Ongoing',
  completed: 'Completed',
}

const STATUS_COLORS: Record<string, string> = {
  planning: 'bg-surface-hover text-muted border-default',
  pre_launch: 'bg-brand-light text-brand border-brand/30',
  launched: 'bg-success-bg text-success border-success/30',
  ongoing: 'bg-accent-bg text-accent border-accent-border',
  completed: 'bg-surface-hover text-subtle border-default',
}

export default async function ProjectsPage({ params }: PageProps) {
  const { orgSlug } = await params
  const { org, isManager, isAdmin } = await getVerifiedWorkspace(orgSlug)
  const service = createServiceClient()

  const { data: projects } = await service
    .from('projects')
    .select('id, name, slug, code, category, type, status, city, location, rera_number, total_units_count, created_at')
    .eq('org_id', org.id)
    .order('created_at', { ascending: false })

  const actions = isManager ? (
    <Link
      href={`/${orgSlug}/projects/new`}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-brand-foreground bg-[var(--brand)] rounded-md hover:bg-[var(--brand-hover)] transition-colors shadow-2xs"
    >
      <Plus className="w-3.5 h-3.5" />
      New project
    </Link>
  ) : null

  return (
    <PageShell
      title="Projects"
      description="Manage property developments, plotted layouts, towers, and inventory records"
      actions={actions}
    >
      {projects && projects.length > 0 ? (
        <div className="stagger grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => {
            const category = (project.category as ProjectCategory) || 'apartments'

            return (
              <div
                key={project.id}
                className="lift surface-raised relative bg-surface border border-default rounded-xl p-5 hover:border-brand/60 group"
              >
                {/* The whole card opens the project; the Manage menu sits above this link. */}
                <Link href={`/${orgSlug}/projects/${project.id}`} className="absolute inset-0 rounded-xl" aria-label={`Open ${project.name}`} />
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0 pr-2">
                    <h3 className="text-[14px] font-semibold text-[var(--foreground)] group-hover:text-[var(--brand)] leading-tight truncate">
                      {project.name}
                    </h3>
                    {project.code && (
                      <span className="font-mono text-[11px] text-brand bg-brand-light px-1.5 py-0.2 rounded mt-1 inline-block">
                        {project.code}
                      </span>
                    )}
                  </div>
                  <div className="relative z-10 flex flex-shrink-0 items-center gap-1">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                        STATUS_COLORS[project.status] ?? 'bg-surface-hover text-muted border-default'
                      }`}
                    >
                      {STATUS_LABEL[project.status] ?? project.status}
                    </span>
                    {isManager && <ProjectCardMenu projectId={project.id} projectName={project.name} orgSlug={orgSlug} canEdit={isManager} canDelete={isAdmin} />}
                  </div>
                </div>

                <div className="text-[12px] text-[var(--foreground-muted)] space-y-1 mt-3">
                  <div className="flex items-center gap-1.5 text-[var(--foreground)] font-medium">
                    <Building2 className="w-3.5 h-3.5 text-[var(--brand)]" />
                    <span>{PROJECT_CATEGORY_LABELS[category] ?? category}</span>
                  </div>

                  {(project.location || project.city) && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-subtle" />
                      <span>{[project.location, project.city].filter(Boolean).join(', ')}</span>
                    </div>
                  )}

                  {project.total_units_count ? (
                    <div className="text-[11px] text-[var(--foreground-subtle)]">
                      Planned Units: {project.total_units_count}
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 pt-3 border-t border-[var(--border)] flex items-center justify-between text-[11px] text-[var(--foreground-subtle)]">
                  <span>Created {formatDate(project.created_at)}</span>
                  <span className="text-[var(--brand)] font-medium group-hover:underline">
                    View Tower Matrix →
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState
          icon={FolderOpen}
          title="No projects yet"
          description="Create your first property project to configure towers, blocks, plots, and inventory records."
          action={
            isManager ? (
              <Link
                href={`/${orgSlug}/projects/new`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-brand-foreground bg-[var(--brand)] rounded-md hover:bg-[var(--brand-hover)] transition-colors shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Create project
              </Link>
            ) : undefined
          }
        />
      )}
    </PageShell>
  )
}
