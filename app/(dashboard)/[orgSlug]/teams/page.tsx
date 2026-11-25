// app/(dashboard)/[orgSlug]/teams/page.tsx — Teams (team structure, 20260097): each team's leader, members and projects,
// how it is doing this month against the other teams, and what it has achieved together. Owners, admins and managers
// create and change teams; team leads see their teams. Shown when team structure is on (Settings → Sales structure).
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getSalesStructure } from '@/lib/dal/sales-structure'
import { listTeamStructure, teamPerformance } from '@/lib/dal/teams'
import { orgTimezone } from '@/lib/dal/performance'
import { teamProfileIdsOf } from '@/lib/dal/viewer'
import { periodWindow } from '@/lib/performance/rules'
import { canTakeLeads, watchesTeam } from '@/lib/sales/structure'
import { LEADER_ROLES, TEAM_MANAGERS, rankTeams } from '@/lib/teams/structure'
import { createServiceClient } from '@/lib/supabase/server'
import { PageShell } from '@/components/layout/PageShell'
import { EmptyState } from '@/components/ui'
import { TeamsClient } from '@/components/teams/TeamsClient'
import type { MemberRole } from '@/types/database'
import { UsersRound } from 'lucide-react'

export const metadata: Metadata = { title: 'Teams' }
export const dynamic = 'force-dynamic'

export default async function TeamsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { org, role, profile, isAdmin } = await getVerifiedWorkspace(orgSlug)
  if (!watchesTeam(role)) notFound()
  const sales = await getSalesStructure(org.id)
  if (!sales.teamsEnabled) {
    return (
      <PageShell title="Teams" description="Organise salespeople into teams, each with a leader and its own projects.">
        <div className="surface-raised rounded-2xl border border-default bg-surface">
          <EmptyState icon={UsersRound} title="Team structure is off" description={isAdmin ? 'Switch it on in Settings → Sales structure to create teams, give each a leader and projects, and compare them.' : 'Ask the owner or an admin to switch on team structure.'}
            action={isAdmin ? <Link href={`/${orgSlug}/settings/sales`} className="btn-primary inline-flex min-h-9 items-center rounded-md bg-brand px-3.5 text-[13px] font-medium text-brand-foreground">Open Sales structure</Link> : undefined} />
        </div>
      </PageShell>
    )
  }
  const tz = await orgTimezone(org.id)
  const month = periodWindow('month', new Date(), tz)
  const svc = createServiceClient()
  const [all, { data: members }, { data: projects }] = await Promise.all([
    listTeamStructure(org.id),
    svc.from('org_members').select('profile_id, role, profiles!org_members_profile_id_fkey(full_name)').eq('org_id', org.id).eq('status', 'active'),
    svc.from('projects').select('id, name').eq('org_id', org.id).order('name'),
  ])
  // A team lead sees the teams they lead or belong to; managers see all.
  const mine = role === 'team_lead' ? new Set(await teamProfileIdsOf(org.id, profile.id)) : null
  const teams = mine ? all.filter((t) => t.leader?.id === profile.id || t.members.some((m) => m.id === profile.id)) : all
  const perf = await teamPerformance(org.id, teams, month)
  const ranked = rankTeams(teams.filter((t) => t.isActive).map((t) => ({ name: t.name, id: t.id, totals: perf.get(t.id)!.period })))
  const people = ((members ?? []) as unknown as { profile_id: string; role: MemberRole; profiles: { full_name: string | null } | null }[])
    .map((m) => ({ id: m.profile_id, name: m.profiles?.full_name?.trim() || 'Team member', role: m.role }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const canManage = (TEAM_MANAGERS as readonly string[]).includes(role ?? '')

  return (
    <PageShell title="Teams" description="Each team’s leader, people and projects — and how the teams compare this month.">
      <TeamsClient orgId={org.id} orgSlug={orgSlug} canManage={canManage}
        teams={teams.map((t) => ({ ...t, rank: ranked.find((r) => r.id === t.id)?.rank ?? null, month: perf.get(t.id)!.period, allTime: perf.get(t.id)!.allTime, achievements: perf.get(t.id)!.achievements }))}
        sellers={people.filter((p) => canTakeLeads(p.role, sales))}
        leaders={people.filter((p) => LEADER_ROLES.includes(p.role))}
        projects={(projects ?? []) as { id: string; name: string }[]} />
    </PageShell>
  )
}
