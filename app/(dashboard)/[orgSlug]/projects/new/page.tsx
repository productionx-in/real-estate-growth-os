// app/(dashboard)/[orgSlug]/projects/new/page.tsx
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { PageShell } from '@/components/layout/PageShell'
import { ProjectForm } from '@/components/projects/ProjectForm'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'

export const metadata: Metadata = { title: 'New Project' }

interface PageProps {
  params: Promise<{ orgSlug: string }>
}

export default async function NewProjectPage({ params }: PageProps) {
  const { orgSlug } = await params
  const workspace = await getVerifiedWorkspace(orgSlug)

  if (!workspace.isManager) {
    redirect(`/${orgSlug}/projects`)
  }

  return (
    <PageShell title="New Project" description="Create a project to group and track leads">
      <ProjectForm orgSlug={orgSlug} orgId={workspace.org.id} />
    </PageShell>
  )
}
