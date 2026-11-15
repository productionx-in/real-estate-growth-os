// app/(dashboard)/my/dashboard/page.tsx
// Personal salesperson dashboard — shows only the viewer's assigned leads.
// Multi-org safe: accepts optional ?orgSlug= query, handles 0, 1, and multiple memberships cleanly.
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { PageShell } from '@/components/layout/PageShell'
import { LeadStatusBadge } from '@/components/leads/LeadStatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatRelative } from '@/lib/utils/format'
import { Users, Clock, TrendingUp, CheckCircle, Building2, ChevronsUpDown } from 'lucide-react'
import type { LeadStatus, MemberRole } from '@/types/database'

export const metadata: Metadata = { title: 'My Dashboard' }
export const dynamic = 'force-dynamic'

type LeadRow = {
  id: string
  name: string
  phone: string
  status: LeadStatus
  priority: string
  updated_at: string
  project: { id: string; name: string } | null
}

interface PageProps {
  searchParams?: Promise<{ orgSlug?: string }>
}

export default async function MyDashboardPage({ searchParams }: PageProps) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const service = createServiceClient()

  // 1. Resolve or create profile
  let { data: profile } = await service
    .from('profiles')
    .select('id, full_name')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) {
    const fullName =
      (user.user_metadata?.full_name as string) ||
      user.email?.split('@')[0] ||
      'Workspace Member'

    const { data: newProfile } = await service
      .from('profiles')
      .insert({ auth_user_id: user.id, full_name: fullName })
      .select('id, full_name')
      .single()

    profile = newProfile
  }

  if (!profile) redirect('/login')

  // 2. Query all verified organisation memberships for this profile
  const { data: allMemberships } = await service
    .from('org_members')
    .select(`
      org_id,
      role,
      organisation:organisations(id, name, slug, type)
    `)
    .eq('profile_id', profile.id)
    .order('joined_at', { ascending: true })

  const memberships = (allMemberships ?? []) as unknown as Array<{
    org_id: string
    role: MemberRole
    organisation: { id: string; name: string; slug: string; type: string } | null
  }>

  // 3. Handle zero memberships
  if (memberships.length === 0) {
    redirect('/create-org')
  }

  const resolvedParams = searchParams ? await searchParams : {}
  const requestedSlug = resolvedParams?.orgSlug

  // 4. Resolve active membership safely
  let activeMembership = requestedSlug
    ? memberships.find((m) => m.organisation?.slug === requestedSlug)
    : null

  if (!activeMembership) {
    if (memberships.length === 1) {
      activeMembership = memberships[0]
    } else {
      // Multiple organisations and no explicit active org specified:
      redirect('/select-org?redirectTo=/my/dashboard')
    }
  }

  const activeOrg = activeMembership.organisation
  if (!activeOrg?.slug) {
    redirect('/select-org')
  }

  const orgSlug = activeOrg.slug
  const role = activeMembership.role

  // Fetch my assigned leads in this verified organisation
  const { data: myLeads } = await service
    .from('leads')
    .select(`
      id, name, phone, status, priority, updated_at,
      project:projects(id, name)
    `)
    .eq('org_id', activeMembership.org_id)
    .eq('assigned_to', profile.id)
    .not('status', 'in', '("booked","lost","junk")')
    .order('updated_at', { ascending: false })
    .limit(50)

  const leads = (myLeads ?? []) as LeadRow[]

  // Counts
  const totalActive = leads.length
  const newToday = leads.filter((l) => {
    const d = new Date(l.updated_at)
    const today = new Date()
    return d.toDateString() === today.toDateString()
  }).length
  const inNegotiation = leads.filter((l) => l.status === 'negotiation').length
  const siteVisitScheduled = leads.filter((l) => l.status === 'site_visit_scheduled').length

  const stats = [
    { label: 'Active Leads', value: totalActive, icon: Users },
    { label: 'Updated Today', value: newToday, icon: Clock },
    { label: 'Site Visits', value: siteVisitScheduled, icon: TrendingUp },
    { label: 'Negotiation', value: inNegotiation, icon: CheckCircle },
  ]

  // Priority sort: high > medium > low, then by updated_at
  const PRIORITY_WEIGHT = { high: 0, medium: 1, low: 2 }
  const sortedLeads = [...leads].sort((a, b) => {
    const pa = PRIORITY_WEIGHT[a.priority as keyof typeof PRIORITY_WEIGHT] ?? 1
    const pb = PRIORITY_WEIGHT[b.priority as keyof typeof PRIORITY_WEIGHT] ?? 1
    return pa - pb
  })

  const PRIORITY_DOT: Record<string, string> = {
    high: 'bg-red-500',
    medium: 'bg-amber-400',
    low: 'bg-gray-300',
  }

  return (
    <PageShell
      title={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span>Welcome back, {profile.full_name.split(' ')[0]}</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              {activeOrg.name} · {role === 'sales_exec' ? 'Sales Executive' : 'Manager'}
            </span>
          </div>
          {memberships.length > 1 && (
            <Link
              href="/select-org?redirectTo=/my/dashboard"
              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 shadow-2xs"
            >
              <Building2 className="w-3.5 h-3.5 text-gray-500" />
              <span>Switch Workspace</span>
              <ChevronsUpDown className="w-3.5 h-3.5 text-gray-400" />
            </Link>
          )}
        </div>
      }
      description={`${activeOrg.name} · Your assigned leads and active pipeline`}
    >
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((s) => {
          const Icon = s.icon
          return (
            <div key={s.label} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-medium text-[var(--foreground-muted)] uppercase tracking-wide">
                  {s.label}
                </span>
                <Icon className="w-4 h-4 text-[var(--foreground-subtle)]" />
              </div>
              <div className="text-2xl font-semibold text-[var(--foreground)]">{s.value}</div>
            </div>
          )
        })}
      </div>

      {/* My leads list */}
      {sortedLeads.length > 0 ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-[var(--foreground)]">My active leads</h2>
            <Link
              href={`/${orgSlug}/leads`}
              className="text-[12px] text-[var(--brand)] hover:underline"
            >
              View all →
            </Link>
          </div>
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-hover)]">
                <th className="text-left px-4 py-2.5 font-medium text-[var(--foreground-muted)]">Lead</th>
                <th className="text-left px-4 py-2.5 font-medium text-[var(--foreground-muted)]">Status</th>
                <th className="text-left px-4 py-2.5 font-medium text-[var(--foreground-muted)]">Project</th>
                <th className="text-left px-4 py-2.5 font-medium text-[var(--foreground-muted)]">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {sortedLeads.map((lead) => (
                <tr key={lead.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-hover)] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${PRIORITY_DOT[lead.priority] ?? 'bg-gray-300'}`}
                        title={`${lead.priority} priority`}
                      />
                      <div>
                        <Link
                          href={`/${orgSlug}/leads/${lead.id}`}
                          className="font-medium text-[var(--foreground)] hover:text-[var(--brand)] transition-colors"
                        >
                          {lead.name}
                        </Link>
                        <div className="text-[11px] text-[var(--foreground-subtle)]">{lead.phone}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <LeadStatusBadge status={lead.status} />
                  </td>
                  <td className="px-4 py-3 text-[var(--foreground-muted)]">
                    {lead.project?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-[var(--foreground-muted)]">
                    {formatRelative(lead.updated_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={Users}
          title="No leads assigned to you"
          description="Your manager will assign leads to you. They'll appear here."
        />
      )}
    </PageShell>
  )
}
