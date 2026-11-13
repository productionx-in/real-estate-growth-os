// components/dashboard/WorkspaceOverview.tsx
// Server component — computes real stats from DB for the verified organisation
import { createServiceClient } from '@/lib/supabase/server'
import { Users, FolderOpen, TrendingUp, CheckCircle, Layers, ArrowRight } from 'lucide-react'
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
}

export async function WorkspaceOverview({ orgSlug, orgId }: WorkspaceOverviewProps) {
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

  // Parallel stat fetches using service client
  const [leadsResult, projectsResult, membersResult, bookedResult, inventoryResult] =
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
              <ArrowRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-[var(--brand)] group-hover:translate-x-0.5 transition-all" />
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
              <ArrowRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-[var(--brand)] group-hover:translate-x-0.5 transition-all" />
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
              <ArrowRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-[var(--brand)] group-hover:translate-x-0.5 transition-all" />
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
