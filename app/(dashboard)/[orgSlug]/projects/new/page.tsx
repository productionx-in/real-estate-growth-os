// app/(dashboard)/[orgSlug]/projects/new/page.tsx
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PageShell } from '@/components/layout/PageShell'
import { ProjectForm } from '@/components/projects/ProjectForm'

export const metadata: Metadata = { title: 'New Project' }

interface PageProps {
  params: Promise<{ orgSlug: string }>
}

export default async function NewProjectPage({ params }: PageProps) {
  const { orgSlug } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('id').eq('auth_user_id', user.id).single()
  if (!profile) redirect('/login')

  const { data: org } = await supabase
    .from('organisations').select('id').eq('slug', orgSlug).single()
  if (!org) redirect(`/${orgSlug}`)

  const { data: membership } = await supabase
    .from('org_members').select('role')
    .eq('org_id', org.id).eq('profile_id', profile.id).single()

  if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
    redirect(`/${orgSlug}/projects`)
  }

  return (
    <PageShell title="New Project" description="Create a project to group and track leads">
      <ProjectForm orgSlug={orgSlug} />
    </PageShell>
  )
}
