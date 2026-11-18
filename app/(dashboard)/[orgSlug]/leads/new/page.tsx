// app/(dashboard)/[orgSlug]/leads/new/page.tsx
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { createServiceClient } from '@/lib/supabase/server'
import { PageShell } from '@/components/layout/PageShell'
import { LeadForm } from '@/components/leads/LeadForm'
import { canCreateLeads } from '@/lib/auth/permissions'

export const metadata: Metadata = { title: 'Add Lead' }

interface PageProps {
  params: Promise<{ orgSlug: string }>
}

export default async function NewLeadPage({ params }: PageProps) {
  const { orgSlug } = await params
  const workspace = await getVerifiedWorkspace(orgSlug)

  if (!canCreateLeads(workspace.role)) {
    redirect(`/${orgSlug}/leads`)
  }

  // Fetch projects for the selector using service client for consistency
  const service = createServiceClient()
  const { data: projects } = await service
    .from('projects')
    .select('id, name')
    .eq('org_id', workspace.org.id)
    .eq('status', 'launched')
    .order('name')

  return (
    <PageShell
      title="Add Lead"
      description="Capture a new lead into your CRM"
    >
      <LeadForm
        orgSlug={orgSlug}
        orgId={workspace.org.id}
        projects={projects ?? []}
      />
    </PageShell>
  )
}
