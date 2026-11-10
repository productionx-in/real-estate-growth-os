// app/(dashboard)/[orgSlug]/leads/new/page.tsx
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { PageShell } from '@/components/layout/PageShell'
import { LeadForm } from '@/components/leads/LeadForm'
import { redirect } from 'next/navigation'

export const metadata: Metadata = { title: 'Add Lead' }

interface PageProps {
  params: Promise<{ orgSlug: string }>
}

export default async function NewLeadPage({ params }: PageProps) {
  const { orgSlug } = await params
  const supabase = await createClient()

  // Resolve org
  const { data: org } = await supabase
    .from('organisations')
    .select('id')
    .eq('slug', orgSlug)
    .single()

  if (!org) redirect(`/${orgSlug}`)

  // Check user is not readonly
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  if (!profile) redirect('/login')

  const { data: membership } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', org.id)
    .eq('profile_id', profile.id)
    .single()

  if (membership?.role === 'readonly') {
    redirect(`/${orgSlug}/leads`)
  }

  // Fetch projects for the selector
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .eq('org_id', org.id)
    .eq('status', 'launched')
    .order('name')

  return (
    <PageShell
      title="Add Lead"
      description="Capture a new lead into your CRM"
    >
      <LeadForm
        orgSlug={orgSlug}
        orgId={org.id}
        projects={projects ?? []}
      />
    </PageShell>
  )
}
