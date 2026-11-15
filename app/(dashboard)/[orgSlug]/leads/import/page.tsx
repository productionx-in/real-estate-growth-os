// app/(dashboard)/[orgSlug]/leads/import/page.tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { createServiceClient } from '@/lib/supabase/server'
import { PageShell } from '@/components/layout/PageShell'
import { CsvImportDropzone } from '@/components/leads/CsvImportDropzone'

export const metadata: Metadata = { title: 'Import Leads' }

interface PageProps {
  params: Promise<{ orgSlug: string }>
}

export default async function ImportLeadsPage({ params }: PageProps) {
  const { orgSlug } = await params
  const workspace = await getVerifiedWorkspace(orgSlug)

  if (!workspace.isManager && !workspace.isAdmin) {
    redirect(`/${orgSlug}/leads`)
  }

  // Fetch active projects for assignment selection using service client
  const service = createServiceClient()
  const { data: projects } = await service
    .from('projects')
    .select('id, name')
    .eq('org_id', workspace.org.id)
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

      <CsvImportDropzone
        orgSlug={orgSlug}
        orgId={workspace.org.id}
        projects={projects ?? []}
      />
    </PageShell>
  )
}
