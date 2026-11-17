// components/dashboard/WorkspaceOverview.tsx
// Server component — computes real stats from DB for the verified organisation
import { createServiceClient } from '@/lib/supabase/server'
import { Users, FolderOpen, CheckCircle, Layers, ArrowRight } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'
import Link from 'next/link'

interface StatCardProps {
  label: string
  value: number | string
  icon: React.ComponentType<{ className?: string }>
  description?: string
  href?: string
}

function StatCard({ label, value, icon: Icon, description, href }: StatCardProps) {
  const content = (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 hover:border-[var(--brand)] transition-all">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[12px] font-medium text-[var(--foreground-muted)] uppercase tracking-wide">
          {label}
        </span>
        <div className="w-8 h-8 rounded-lg bg-[var(--surface-hover)] flex items-center justify-center">
          <Icon className="w-4 h-4 text-[var(--foreground-muted)]" />
        </div>
      </div>
      <div className="text-2xl font-bold text-[var(--foreground)]">{value}</div>
      {description && (
        <p className="mt-1 text-[12px] text-[var(--foreground-muted)]">{description}</p>
      )}
    </div>
  )

  if (href) {
    return <Link href={href}>{content}</Link>
  }

  return content
}

interface WorkspaceOverviewProps {
  orgSlug: string
  orgId?: string
  role?: string
  profileId?: string
}

export async function WorkspaceOverview({
  orgSlug,
  orgId,
  role,
  profileId,
}: WorkspaceOverviewProps) {
  const service = createServiceClient()

  // Fetch org if orgId not passed
  let resolvedOrgId = orgId
  if (!resolvedOrgId) {
    const { data: org } = await service
      .from('organisations')
      .select('id, name, type')
      .eq('slug', orgSlug)
      .maybeSingle()

    if (!org) return <EmptyState title="Organisation not found" />
    resolvedOrgId = org.id
  }

  // Role-Specific: Sales Executive Workspace-Scoped Dashboard (Approved Decision 2)
  if (role === 'sales_exec' && profileId) {
    const [myLeadsRes, mySiteVisitsRes] = await Promise.all([
      service
        .from('leads')
        .select(`
          id, name, phone, email, status, priority, updated_at,
          project:projects(id, name)
        `)
        .eq('org_id', resolvedOrgId)
        .eq('assigned_to', profileId)
        .not('status', 'in', '("booked","lost","junk")')
        .order('updated_at', { ascending: false })
        .limit(25),
      service
        .from('site_visits')
        .select('id, scheduled_at, status', { count: 'exact' })
        .eq('org_id', resolvedOrgId)
        .eq('assigned_to', profileId)
        .eq('status', 'scheduled'),
    ])

    const myLeads = myLeadsRes.data || []
    const activeLeadsCount = myLeads.length
    const updatedTodayCount = myLeads.filter((l) => {
      const d = new Date(l.updated_at)
      return d.toDateString() === new Date().toDateString()
    }).length
    const inNegotiationCount = myLeads.filter((l) => l.status === 'negotiation').length
    const siteVisitsCount = mySiteVisitsRes.count || 0

    const execStats = [
      {
        label: 'My Active Leads',
        value: activeLeadsCount,
        icon: Users,
        description: 'Assigned prospect inquiries',
        href: `/${orgSlug}/leads`,
      },
      {
        label: 'Actioned Today',
        value: updatedTodayCount,
        icon: CheckCircle,
        description: 'Leads with status or notes today',
      },
      {
        label: 'Scheduled Visits',
        value: siteVisitsCount,
        icon: FolderOpen,
        description: 'Pending buyer site tours',
        href: `/${orgSlug}/sales`,
      },
      {
        label: 'In Negotiation',
        value: inNegotiationCount,
        icon: Layers,
        description: 'Deals near booking stage',
      },
    ]

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {execStats.map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))}
        </div>

        {/* Priority Calling Queue */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden shadow-2xs">
          <div className="px-5 py-3 border-b border-[var(--border)] flex items-center justify-between">
            <div>
              <h2 className="text-[13px] font-semibold text-[var(--foreground)]">
                My Priority Calling Queue
              </h2>
              <p className="text-[11px] text-[var(--foreground-muted)]">
                Assigned buyer enquiries awaiting follow-up or scheduled visits
              </p>
            </div>
            <Link
              href={`/${orgSlug}/leads`}
              className="text-xs font-medium text-[var(--brand)] hover:underline flex items-center gap-1"
            >
              <span>View all leads</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {myLeads.length > 0 ? (
            <div className="divide-y divide-[var(--border)]">
              {myLeads.slice(0, 8).map((lead) => (
                <div
                  key={lead.id}
                  className="px-5 py-3 flex items-center justify-between hover:bg-[var(--surface-hover)] transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/${orgSlug}/leads/${lead.id}`}
                        className="text-xs font-semibold text-[var(--foreground)] hover:text-[var(--brand)] transition-colors"
                      >
                        {lead.name}
                      </Link>
                      <span className="text-[11px] px-2 py-0.2 rounded-full font-medium bg-surface-hover text-muted capitalize">
                        {lead.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="text-[11px] text-[var(--foreground-muted)] mt-0.5 flex items-center gap-2">
                      <span>{lead.phone}</span>
                      {lead.project?.name && (
                        <span>• Project: {lead.project.name}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/${orgSlug}/leads/${lead.id}`}
                      className="px-2.5 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition"
                    >
                      Update Lead
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-[var(--foreground-muted)]">
              No pending leads in your queue. All assigned inquiries are up to date!
            </div>
          )}
        </div>

        {/* Quick Operational Shortcuts */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            href={`/${orgSlug}/inventory`}
            className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] hover:bg-[var(--surface-hover)] transition-all group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--foreground)] group-hover:text-[var(--brand)]">
                Browse Available Units to Pitch
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-subtle group-hover:text-[var(--brand)]" />
            </div>
            <p className="text-[11px] text-[var(--foreground-muted)] mt-1">
              Check live floor matrices, unit specifications, and pricing to advise prospective buyers.
            </p>
          </Link>

          <Link
            href={`/${orgSlug}/sales`}
            className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] hover:bg-[var(--surface-hover)] transition-all group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--foreground)] group-hover:text-[var(--brand)]">
                Site Visit Management
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-subtle group-hover:text-[var(--brand)]" />
            </div>
            <p className="text-[11px] text-[var(--foreground-muted)] mt-1">
              Review scheduled tours, visitor arrival times, and VIP cab arrangements.
            </p>
          </Link>
        </div>
      </div>
    )
  }

  // Executive / Management Dashboard (Admins, Owners, Managers, Auditors)

  // Parallel stat fetches using service client
  const [leadsResult, projectsResult, , bookedResult, inventoryResult] =
    await Promise.all([
      service.from('leads').select('id', { count: 'exact', head: true }).eq('org_id', resolvedOrgId),
      service.from('projects').select('id', { count: 'exact', head: true }).eq('org_id', resolvedOrgId),
      service.from('org_members').select('id', { count: 'exact', head: true }).eq('org_id', resolvedOrgId),
      service.from('leads').select('id', { count: 'exact', head: true }).eq('org_id', resolvedOrgId).eq('status', 'booked'),
      service.from('inventory_items').select('id', { count: 'exact', head: true }).eq('org_id', resolvedOrgId),
    ])

  const stats = [
    {
      label: 'Active Projects',
      value: projectsResult.count ?? 0,
      icon: FolderOpen,
      description: 'Apartments, plots & villas',
      href: `/${orgSlug}/projects`,
    },
    {
      label: 'Total Inventory Units',
      value: inventoryResult.count ?? 0,
      icon: Layers,
      description: 'Across all towers & blocks',
      href: `/${orgSlug}/inventory`,
    },
    {
      label: 'Total Leads',
      value: leadsResult.count ?? 0,
      icon: Users,
      description: 'Active CRM inquiries',
      href: `/${orgSlug}/leads`,
    },
    {
      label: 'Confirmed Bookings',
      value: bookedResult.count ?? 0,
      icon: CheckCircle,
      description: 'Booked properties',
      href: `/${orgSlug}/leads?status=booked`,
    },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      {/* Quick Launch & Workflows */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-2xs">
        <h2 className="text-[13px] font-semibold text-[var(--foreground)] mb-3 flex items-center justify-between">
          <span>Real Estate Growth Modules</span>
          <span className="text-[11px] text-[var(--foreground-muted)] font-normal">
            Direct shortcuts
          </span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link
            href={`/${orgSlug}/projects`}
            className="p-3.5 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] hover:bg-[var(--surface-hover)] transition-all group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--foreground)] group-hover:text-[var(--brand)]">
                Project & Tower Management
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-subtle group-hover:text-[var(--brand)] group-hover:translate-x-0.5 transition-all" />
            </div>
            <p className="text-[11px] text-[var(--foreground-muted)] mt-1">
              Configure towers, phases, blocks, floor matrices and master layouts.
            </p>
          </Link>

          <Link
            href={`/${orgSlug}/inventory`}
            className="p-3.5 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] hover:bg-[var(--surface-hover)] transition-all group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--foreground)] group-hover:text-[var(--brand)]">
                Visual Inventory Explorer
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-subtle group-hover:text-[var(--brand)] group-hover:translate-x-0.5 transition-all" />
            </div>
            <p className="text-[11px] text-[var(--foreground-muted)] mt-1">
              Dual view: interactive tower/floor matrix & structured search table.
            </p>
          </Link>

          <Link
            href={`/${orgSlug}/leads`}
            className="p-3.5 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] hover:bg-[var(--surface-hover)] transition-all group"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[var(--foreground)] group-hover:text-[var(--brand)]">
                Leads CRM & Pipelines
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-subtle group-hover:text-[var(--brand)] group-hover:translate-x-0.5 transition-all" />
            </div>
            <p className="text-[11px] text-[var(--foreground-muted)] mt-1">
              Track customer inquiries, schedule site visits, and import CSV batches.
            </p>
          </Link>
        </div>
      </div>
    </div>
  )
}
