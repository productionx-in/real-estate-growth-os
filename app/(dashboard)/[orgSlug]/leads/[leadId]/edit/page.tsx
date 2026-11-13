// app/(dashboard)/[orgSlug]/leads/[leadId]/edit/page.tsx
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PageShell } from '@/components/layout/PageShell'
import { LeadForm } from '@/components/leads/LeadForm'
import { getLeadById } from '@/lib/dal/leads'
import type { LeadFormValues } from '@/lib/validations/lead'

export const metadata: Metadata = { title: 'Edit Lead' }

interface PageProps {
  params: Promise<{ orgSlug: string; leadId: string }>
}

export default async function EditLeadPage({ params }: PageProps) {
  const { orgSlug, leadId } = await params
  const supabase = await createClient()

  // 1. Resolve org
  const { data: org } = await supabase
    .from('organisations')
    .select('id')
    .eq('slug', orgSlug)
    .single()

  if (!org) redirect(`/${orgSlug}`)

  // 2. Resolve user
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (!profile) redirect('/login')

  // 3. Resolve lead
  const lead = await getLeadById(leadId)
  if (!lead || lead.org_id !== org.id) notFound()

  // 4. Resolve membership & role
  const { data: membership } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', org.id)
    .eq('profile_id', profile.id)
    .single()

  if (!membership || membership.role === 'readonly') {
    redirect(`/${orgSlug}/leads/${leadId}`)
  }

  // If sales_exec, must be assigned to lead
  if (membership.role === 'sales_exec' && lead.assigned_to !== profile.id) {
    redirect(`/${orgSlug}/leads/${leadId}`)
  }

  // 5. Fetch projects for dropdown
  const { data: projects } = await supabase
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
