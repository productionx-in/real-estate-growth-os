// app/(dashboard)/[orgSlug]/leads/[leadId]/edit/page.tsx
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { PageShell } from '@/components/layout/PageShell'
import { LeadForm } from '@/components/leads/LeadForm'
import { getLeadById } from '@/lib/dal/leads'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { createServiceClient } from '@/lib/supabase/server'
import type { LeadFormValues } from '@/lib/validations/lead'
import { canWorkLead } from '@/lib/auth/permissions'
import { resolveLeadViewer } from '@/lib/dal/viewer'

export const metadata: Metadata = { title: 'Edit Lead' }

interface PageProps {
  params: Promise<{ orgSlug: string; leadId: string }>
}

export default async function EditLeadPage({ params }: PageProps) {
  const { orgSlug, leadId } = await params
  const { org, role, profile } = await getVerifiedWorkspace(orgSlug)

  if (role === 'readonly') {
    redirect(`/${orgSlug}/leads`)
  }

  // 1. Resolve lead
  const lead = await getLeadById(leadId)
  if (!lead || lead.org_id !== org.id) notFound()

  // 2. Only someone who works this lead (own, team's, booked customer for post-sales, or a manager)
  if (!canWorkLead(await resolveLeadViewer(org.id, role, profile.id), lead)) {
    redirect(`/${orgSlug}/leads`)
  }

  const service = createServiceClient()

  // 3. Fetch projects for dropdown
  const { data: projects } = await service
    .from('projects')
    .select('id, name')
    .eq('org_id', org.id)
    .order('name')

  const defaultValues: Partial<LeadFormValues> = {
    name: lead.name,
    phone: lead.phone,
    email: lead.email ?? '',
    source: lead.source,
    status: lead.status,
    priority: lead.priority,
    project_id: lead.project_id ?? '',
    budget_min: lead.budget_min,
    budget_max: lead.budget_max,
    notes: lead.notes ?? '',
  }

  return (
    <PageShell
      title={`Edit ${lead.name}`}
      description="Update lead details and requirements"
    >
      <LeadForm
        orgSlug={orgSlug}
        orgId={org.id}
        projects={projects ?? []}
        defaultValues={defaultValues}
        leadId={leadId}
      />
    </PageShell>
  )
}
