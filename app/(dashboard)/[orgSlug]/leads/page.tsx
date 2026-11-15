// app/(dashboard)/[orgSlug]/leads/page.tsx
import type { Metadata } from 'next'
import type { ComponentProps } from 'react'
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
  searchParams: Promise<{ status?: string; source?: string; scope?: string }>
}

export default async function LeadsPage({ params, searchParams }: PageProps) {
  const { orgSlug } = await params
  const { status, source, scope } = await searchParams

  const { org, role, profile, isManager } = await getVerifiedWorkspace(orgSlug)
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

  // Server-authoritative role-based visibility enforcement:
  if (role === 'sales_exec') {
    // Sales executives only see leads assigned to them — perfectly consistent with RLS
    query = query.eq('assigned_to', profile.id)
  } else if (isManager) {
    if (scope === 'my') {
      query = query.eq('assigned_to', profile.id)
    } else if (scope === 'unassigned') {
      query = query.is('assigned_to', null)
    }
  }

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

  const pageTitle = role === 'sales_exec' ? 'My Leads' : 'Leads'
  const pageDescription =
    role === 'sales_exec'
      ? `${leads?.length ?? 0} direct customer enquiries assigned to you for ${org.name}`
      : isManager
        ? `${leads?.length ?? 0} leads in ${scope === 'unassigned' ? 'unassigned queue' : scope === 'my' ? 'your personal queue' : 'pipeline'}`
        : `${leads?.length ?? 0} leads in pipeline`

  return (
    <PageShell
      title={pageTitle}
      description={pageDescription}
      actions={actions}
    >
      {isManager && (
        <div className="flex items-center gap-2 mb-4 border-b border-[var(--border)] pb-3">
          <Link
            href={`/${orgSlug}/leads`}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              !scope || scope === 'all'
                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            All Organisation Leads
          </Link>
          <Link
            href={`/${orgSlug}/leads?scope=my`}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              scope === 'my'
                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            My Assigned Leads
          </Link>
          <Link
            href={`/${orgSlug}/leads?scope=unassigned`}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              scope === 'unassigned'
                ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Unassigned Queue
          </Link>
        </div>
      )}

      {leads && leads.length > 0 ? (
        <LeadsTable
          leads={(leads ?? []) as unknown as ComponentProps<typeof LeadsTable>['leads']}
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
