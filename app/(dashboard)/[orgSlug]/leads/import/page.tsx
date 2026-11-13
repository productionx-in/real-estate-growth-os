// app/(dashboard)/[orgSlug]/leads/import/page.tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PageShell } from '@/components/layout/PageShell'
import { CsvImportDropzone } from '@/components/leads/CsvImportDropzone'

export const metadata: Metadata = { title: 'Import Leads' }

interface PageProps {
  params: Promise<{ orgSlug: string }>
}

export default async function ImportLeadsPage({ params }: PageProps) {
  const { orgSlug } = await params
  const supabase = await createClient()

  // 1. Resolve org
  const { data: org } = await supabase
    .from('organisations')
    .select('id')
    .eq('slug', orgSlug)
    .single()

  if (!org) redirect(`/${orgSlug}`)

  // 2. Resolve user & permissions
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

  const { data: membership } = await supabase
    .from('org_members')
    .select('role')
    .eq('org_id', org.id)
    .eq('profile_id', profile.id)
    .single()

  if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
    redirect(`/${orgSlug}/leads`)
  }

  // 3. Fetch active projects for assignment selection
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .eq('org_id', org.id)
    .order('name')

  return (
    <PageShell
      title="Import Leads"
      description="Upload a CSV spreadsheet to bulk import leads into your CRM"
    >
      <div className="mb-5">
        <Link
          href={`/${orgSlug}/leads`}
          className="inline-flex items-center gap-1.5 text-[13px] text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to leads
        </Link>
      </div>

      <CsvImportDropzone orgSlug={orgSlug} projects={projects ?? []} />
    </PageShell>
  )
}
