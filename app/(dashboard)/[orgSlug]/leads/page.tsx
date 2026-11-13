// app/(dashboard)/[orgSlug]/leads/page.tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus, Upload, Users } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/server'
import { PageShell } from '@/components/layout/PageShell'
import { LeadsTable } from '@/components/leads/LeadsTable'
import { ExportLeadsButton } from '@/components/leads/ExportLeadsButton'
import { EmptyState } from '@/components/shared/EmptyState'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import type { LeadStatus, LeadSource } from '@/types/database'

export const metadata: Metadata = { title: 'Leads' }
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ status?: string; source?: string }>
}

export default async function LeadsPage({ params, searchParams }: PageProps) {
  const { orgSlug } = await params
  const { status, source } = await searchParams

  const { org, role, isManager } = await getVerifiedWorkspace(orgSlug)
  const service = createServiceClient()

  // Fetch leads for this organisation
  let query = service
    .from('leads')
    .select(`
      id, name, phone, email, status, priority, source, created_at,
      project:projects(id, name),
      assignee:profiles!leads_assigned_to_fkey(id, full_name)
    `)
    .eq('org_id', org.id)
    .order('created_at', { ascending: false })
    .limit(100)

  if (status) query = query.eq('status', status as LeadStatus)
  if (source) query = query.eq('source', source as LeadSource)

  const { data: leads } = await query

  const actions = (
    <>
      {role !== 'readonly' && leads && leads.length > 0 && (
        <ExportLeadsButton
          orgSlug={orgSlug}
          currentStatus={status}
          currentSource={source}
        />
      )}
      {isManager && (
        <Link
          href={`/${orgSlug}/leads/import`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-[var(--foreground)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--surface-hover)] transition-colors shadow-2xs"
        >
          <Upload className="w-3.5 h-3.5" />
          Import CSV
        </Link>
      )}
      {role !== 'readonly' && (
        <Link
          href={`/${orgSlug}/leads/new`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-white bg-[var(--brand)] rounded-md hover:bg-[var(--brand-hover)] transition-colors shadow-2xs"
        >
          <Plus className="w-3.5 h-3.5" />
          Add lead
        </Link>
      )}
    </>
  )

  return (
    <PageShell
      title="Leads"
      description={
        isManager
          ? `${leads?.length ?? 0} leads in pipeline`
          : `${leads?.length ?? 0} assigned leads`
      }
      actions={actions}
    >
      {leads && leads.length > 0 ? (
        <LeadsTable
          leads={leads as any}
          orgSlug={orgSlug}
          orgId={org.id}
          viewerRole={role}
        />
      ) : (
        <EmptyState
          icon={Users}
          title={isManager ? 'No leads in pipeline yet' : 'No leads assigned to you'}
          description={
            isManager
              ? 'Add your first real estate lead manually or import a batch from a CSV file.'
              : 'Your sales manager will assign incoming leads to you.'
          }
          action={
            isManager ? (
              <Link
                href={`/${orgSlug}/leads/new`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-white bg-[var(--brand)] rounded-md hover:bg-[var(--brand-hover)] transition-colors shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Add first lead
              </Link>
            ) : undefined
          }
        />
      )}
    </PageShell>
  )
}
