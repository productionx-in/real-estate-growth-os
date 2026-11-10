// app/(dashboard)/my/dashboard/page.tsx
// Personal salesperson dashboard — shows only the viewer's assigned leads.
// Accessible regardless of org slug — uses the user's JWT claims.
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PageShell } from '@/components/layout/PageShell'
import { LeadStatusBadge } from '@/components/leads/LeadStatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { formatRelative } from '@/lib/utils/format'
import { Users, Clock, TrendingUp, CheckCircle } from 'lucide-react'
import type { LeadStatus, MemberRole } from '@/types/database'

export const metadata: Metadata = { title: 'My Dashboard' }

export const instant = false

type LeadRow = {
  id: string
  name: string
  phone: string
  status: LeadStatus
  priority: string
  updated_at: string
  project: { id: string; name: string } | null
}

export default async function MyDashboardPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('id, full_name').eq('auth_user_id', user.id).single()
  if (!profile) redirect('/register')

  const { data: membership } = await supabase
    .from('org_members').select('org_id, role, organisations(slug)')
    .eq('profile_id', profile.id).single()

  if (!membership) redirect('/register')

  const orgSlug = (membership.organisations as { slug: string } | null)?.slug ?? ''
  const role = membership.role as MemberRole

  // Fetch my assigned leads
  const { data: myLeads } = await supabase
    .from('leads')
    .select(`
      id, name, phone, status, priority, updated_at,
      project:projects(id, name)
    `)
    .eq('org_id', membership.org_id)
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
      title={`Welcome back, ${profile.full_name.split(' ')[0]}`}
      description={`${role === 'sales_exec' ? 'Sales Executive' : 'Manager'} · Your assigned pipeline`}
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
