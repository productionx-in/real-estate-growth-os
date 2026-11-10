// app/(dashboard)/[orgSlug]/leads/page.tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus, Upload, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PageShell } from '@/components/layout/PageShell'
import { LeadsTable } from '@/components/leads/LeadsTable'
import { EmptyState } from '@/components/shared/EmptyState'
import type { LeadStatus, LeadSource, MemberRole } from '@/types/database'

export const metadata: Metadata = { title: 'Leads' }

interface PageProps {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ status?: string; source?: string }>
}

export default async function LeadsPage({ params, searchParams }: PageProps) {
  const { orgSlug } = await params
  const { status, source } = await searchParams

  const supabase = await createClient()

  // 1. Resolve org
  const { data: org } = await supabase
    .from('organisations')
    .select('id')
    .eq('slug', orgSlug)
    .single()

  if (!org) return null

  // 2. Resolve current user's profile + role
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .single()

  const { data: membership } = profile
    ? await supabase
        .from('org_members')
        .select('role')
        .eq('org_id', org.id)
        .eq('profile_id', profile.id)
        .single()
    : { data: null }

  const viewerRole = (membership?.role ?? 'readonly') as MemberRole

  // 3. Fetch leads — RLS handles row-level visibility automatically
  let query = supabase
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

  const isManager = ['owner', 'admin', 'manager'].includes(viewerRole)

  const actions = (
    <>
      {isManager && (
        <Link
          href={`/${orgSlug}/leads/import`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-[var(--foreground)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--surface-hover)] transition-colors"
        >
          <Upload className="w-3.5 h-3.5" />
          Import CSV
        </Link>
      )}
      {viewerRole !== 'readonly' && (
        <Link
          href={`/${orgSlug}/leads/new`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-white bg-[var(--brand)] rounded-md hover:bg-[var(--brand-hover)] transition-colors"
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
          ? `${leads?.length ?? 0} leads`
          : `${leads?.length ?? 0} assigned to you`
      }
      actions={actions}
    >
      {leads && leads.length > 0 ? (
        <LeadsTable
          leads={leads as any}
          orgSlug={orgSlug}
          orgId={org.id}
          viewerRole={viewerRole}
        />
      ) : (
        <EmptyState
          icon={Users}
          title={isManager ? 'No leads yet' : 'No leads assigned to you'}
          description={
            isManager
              ? 'Add your first lead manually or import from a CSV file.'
              : 'Your manager will assign leads to you. Check back soon.'
          }
          action={
            isManager ? (
              <Link
                href={`/${orgSlug}/leads/new`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-white bg-[var(--brand)] rounded-md hover:bg-[var(--brand-hover)] transition-colors"
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
