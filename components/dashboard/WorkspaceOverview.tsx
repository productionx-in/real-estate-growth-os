// components/dashboard/WorkspaceOverview.tsx
// Server component — fetches real stats from DB
import { createClient } from '@/lib/supabase/server'
import { Users, FolderOpen, TrendingUp, CheckCircle } from 'lucide-react'
import { EmptyState } from '@/components/shared/EmptyState'

interface StatCardProps {
  label: string
  value: number | string
  icon: React.ComponentType<{ className?: string }>
  description?: string
}

function StatCard({ label, value, icon: Icon, description }: StatCardProps) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[12px] font-medium text-[var(--foreground-muted)] uppercase tracking-wide">
          {label}
        </span>
        <div className="w-7 h-7 rounded-md bg-[var(--surface-hover)] flex items-center justify-center">
          <Icon className="w-4 h-4 text-[var(--foreground-muted)]" />
        </div>
      </div>
      <div className="text-2xl font-semibold text-[var(--foreground)]">{value}</div>
      {description && (
        <p className="mt-1 text-[12px] text-[var(--foreground-muted)]">{description}</p>
      )}
    </div>
  )
}

interface WorkspaceOverviewProps {
  orgSlug: string
}

export async function WorkspaceOverview({ orgSlug }: WorkspaceOverviewProps) {
  const supabase = await createClient()

  // Fetch org
  const { data: org } = await supabase
    .from('organisations')
    .select('id, name, type')
    .eq('slug', orgSlug)
    .single()

  if (!org) return <EmptyState title="Organisation not found" />

  // Parallel stat fetches
  const [leadsResult, projectsResult, membersResult, bookedResult] = await Promise.all([
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('org_id', org.id),
    supabase.from('projects').select('id', { count: 'exact', head: true }).eq('org_id', org.id),
    supabase.from('org_members').select('id', { count: 'exact', head: true }).eq('org_id', org.id),
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', org.id)
      .eq('status', 'booked'),
  ])

  const stats = [
    {
      label: 'Total Leads',
      value: leadsResult.count ?? 0,
      icon: Users,
      description: 'All time',
    },
    {
      label: 'Active Projects',
      value: projectsResult.count ?? 0,
      icon: FolderOpen,
      description: 'Across all stages',
    },
    {
      label: 'Team Members',
      value: membersResult.count ?? 0,
      icon: TrendingUp,
      description: 'In your workspace',
    },
    {
      label: 'Booked',
      value: bookedResult.count ?? 0,
      icon: CheckCircle,
      description: 'Confirmed bookings',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      {/* Quick links */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
        <h2 className="text-[13px] font-semibold text-[var(--foreground)] mb-3">
          Getting started
        </h2>
        <div className="space-y-2 text-[13px] text-[var(--foreground-muted)]">
          <p>→ Add your first <strong className="text-[var(--foreground)]">project</strong> from the Projects section</p>
          <p>→ <strong className="text-[var(--foreground)]">Import leads</strong> via CSV or add them manually</p>
          <p>→ <strong className="text-[var(--foreground)]">Invite team members</strong> from the Team section</p>
        </div>
      </div>
    </div>
  )
}
