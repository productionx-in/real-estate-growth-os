// app/(dashboard)/[orgSlug]/projects/page.tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus, FolderOpen } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PageShell } from '@/components/layout/PageShell'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatDate } from '@/lib/utils/format'

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
  planning: 'bg-gray-100 text-gray-600',
  pre_launch: 'bg-blue-50 text-blue-700',
  launched: 'bg-green-50 text-green-700',
  ongoing: 'bg-indigo-50 text-indigo-700',
  completed: 'bg-gray-100 text-gray-500',
}

export default async function ProjectsPage({ params }: PageProps) {
  const { orgSlug } = await params
  const supabase = await createClient()

  const { data: org } = await supabase
    .from('organisations')
    .select('id')
    .eq('slug', orgSlug)
    .single()

  if (!org) return null

  const { data: projects } = await supabase
    .from('projects')
    .select('id, name, slug, type, status, city, created_at')
    .eq('org_id', org.id)
    .order('created_at', { ascending: false })

  const actions = (
    <Link
      href={`/${orgSlug}/projects/new`}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-white bg-[var(--brand)] rounded-md hover:bg-[var(--brand-hover)] transition-colors"
    >
      <Plus className="w-3.5 h-3.5" />
      New project
    </Link>
  )

  return (
    <PageShell title="Projects" description="Manage your real estate projects" actions={actions}>
      {projects && projects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/${orgSlug}/projects/${project.id}`}
              className="block bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 hover:border-[var(--border-strong)] hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-[14px] font-semibold text-[var(--foreground)] leading-tight">
                  {project.name}
                </h3>
                <span
                  className={`ml-2 flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                    STATUS_COLORS[project.status] ?? 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {STATUS_LABEL[project.status] ?? project.status}
                </span>
              </div>
              <div className="text-[12px] text-[var(--foreground-muted)] space-y-1">
                {project.city && <div>📍 {project.city}</div>}
                <div className="capitalize">{project.type.replace('_', ' ')}</div>
              </div>
              <div className="mt-3 pt-3 border-t border-[var(--border)] text-[11px] text-[var(--foreground-subtle)]">
                Created {formatDate(project.created_at)}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={FolderOpen}
          title="No projects yet"
          description="Create your first project to start tracking leads against it."
          action={
            <Link
              href={`/${orgSlug}/projects/new`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-white bg-[var(--brand)] rounded-md hover:bg-[var(--brand-hover)] transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Create project
            </Link>
          }
        />
      )}
    </PageShell>
  )
}
