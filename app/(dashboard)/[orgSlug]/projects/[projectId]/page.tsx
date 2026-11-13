// app/(dashboard)/[orgSlug]/projects/[projectId]/page.tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Building2, MapPin } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/server'
import { PageShell } from '@/components/layout/PageShell'
import { ProjectDetailTabs } from '@/components/projects/ProjectDetailTabs'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { PROJECT_CATEGORY_LABELS, type ProjectCategory } from '@/types/inventory'

export const metadata: Metadata = { title: 'Project Details' }
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ orgSlug: string; projectId: string }>
}

const STATUS_LABEL: Record<string, string> = {
  planning: 'Planning',
  pre_launch: 'Pre-launch',
  launched: 'Launched',
  ongoing: 'Ongoing',
  completed: 'Completed',
}

const STATUS_COLORS: Record<string, string> = {
  planning: 'bg-gray-100 text-gray-700 border-gray-200',
  pre_launch: 'bg-blue-50 text-blue-700 border-blue-200',
  launched: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ongoing: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  completed: 'bg-gray-100 text-gray-500 border-gray-200',
}

export default async function ProjectDetailPage({ params }: PageProps) {
  const { orgSlug, projectId } = await params
  const { org, role, isManager } = await getVerifiedWorkspace(orgSlug)
  const service = createServiceClient()

  // Fetch project
  const { data: project } = await service
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('org_id', org.id)
    .maybeSingle()

  if (!project) notFound()

  // Fetch project inventory items
  const { data: inventoryData } = await service
    .from('inventory_items')
    .select(`
      *,
      project:projects(id, name, slug, code, category),
      hierarchy_node:project_hierarchy_nodes(id, name, node_type)
    `)
    .eq('project_id', projectId)
    .order('unit_number', { ascending: true })

  const inventoryItems = inventoryData ?? []

  // Fetch project leads
  const { data: leads } = await service
    .from('leads')
    .select(`
      id, name, phone, email, status, priority, source, created_at,
      project:projects(id, name),
      assignee:profiles!leads_assigned_to_fkey(id, full_name)
    `)
    .eq('org_id', org.id)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  const category = (project.category as ProjectCategory) || 'apartments'

  return (
    <PageShell
      title={
        <div className="flex flex-wrap items-center gap-2.5">
          <span>{project.name}</span>
          {project.code && (
            <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
              {project.code}
            </span>
          )}
        </div>
      }
      description={
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--foreground-muted)]">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${
              STATUS_COLORS[project.status] ?? ''
            }`}
          >
            {STATUS_LABEL[project.status] ?? project.status}
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--surface-muted)] text-[var(--foreground)] border border-[var(--border)] font-medium text-[11px]">
            <Building2 className="w-3 h-3 text-[var(--brand)]" />
            {PROJECT_CATEGORY_LABELS[category] ?? category}
          </span>
          {(project.location || project.city) && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3 h-3 text-gray-400" />
              {[project.location, project.city].filter(Boolean).join(', ')}
            </span>
          )}
        </div>
      }
    >
      <div className="mb-4">
        <Link
          href={`/${orgSlug}/projects`}
          className="inline-flex items-center gap-1.5 text-[13px] text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to projects
        </Link>
      </div>

      <ProjectDetailTabs
        project={{
          ...project,
          category,
        }}
        inventoryItems={inventoryItems}
        leads={leads ?? []}
        orgSlug={orgSlug}
        viewerRole={role}
        isManager={isManager}
      />
    </PageShell>
  )
}
