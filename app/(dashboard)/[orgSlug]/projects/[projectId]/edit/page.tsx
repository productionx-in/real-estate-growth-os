// app/(dashboard)/[orgSlug]/projects/[projectId]/edit/page.tsx
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/server'
import { PageShell } from '@/components/layout/PageShell'
import { ProjectForm } from '@/components/projects/ProjectForm'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import type { ProjectFormValues } from '@/lib/validations/project'
import type { ProjectCategory, ProjectType } from '@/types/database'

export const metadata: Metadata = { title: 'Edit Project' }
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ orgSlug: string; projectId: string }>
}

export default async function EditProjectPage({ params }: PageProps) {
  const { orgSlug, projectId } = await params
  const workspace = await getVerifiedWorkspace(orgSlug)

  if (!workspace.isManager) {
    redirect(`/${orgSlug}/projects/${projectId}`)
  }

  const service = createServiceClient()

  // Fetch project scoped to this organisation
  const { data: project } = await service
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .eq('org_id', workspace.org.id)
    .maybeSingle()

  if (!project) notFound()

  const defaultValues: Partial<ProjectFormValues> = {
    name: project.name,
    code: project.code ?? '',
    category: (project.category as ProjectCategory) ?? 'apartments',
    type: (project.type as ProjectType) ?? 'residential',
    status: project.status,
    city: project.city ?? '',
    location: project.location ?? '',
    description: project.description ?? '',
    rera_number: project.rera_number ?? '',
    total_area_value: project.total_area_value ?? undefined,
    total_area_unit: project.total_area_unit ?? 'acres',
    total_units_count: project.total_units_count ?? 0,
    approval_authority: project.approval_authority ?? '',
    launch_date: project.launch_date ?? '',
    completion_date: project.completion_date ?? '',
    brochure_url: project.brochure_url ?? '',
    amenities: Array.isArray(project.amenities) ? (project.amenities as string[]) : [],
    specifications:
      typeof project.specifications === 'object' && project.specifications !== null
        ? (project.specifications as Record<string, unknown>)
        : {},
  }

  return (
    <PageShell
      title={`Edit ${project.name}`}
      description="Update project specifications, timeline, regulatory approvals and collateral"
    >
      <div className="mb-4">
        <Link
          href={`/${orgSlug}/projects/${projectId}`}
          className="inline-flex items-center gap-1.5 text-[13px] text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to project details
        </Link>
      </div>

      <ProjectForm
        orgSlug={orgSlug}
        orgId={workspace.org.id}
        projectId={project.id}
        defaultValues={defaultValues}
      />
    </PageShell>
  )
}
