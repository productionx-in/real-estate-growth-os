// app/(dashboard)/[orgSlug]/performance/manage/page.tsx — Targets & settings (owners and admins): targets for people,
// teams or everyone with their history; points, levels, daily missions and leaderboard privacy; the workspace's own
// achievements; audited point corrections. Every save goes through /api/performance/*, which checks the role again.
import { sellsPersonally, watchesTeam } from '@/lib/sales/structure'
import { getSalesStructure } from '@/lib/dal/sales-structure'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getAchievements, getGamification, listTargets, targetHistory } from '@/lib/dal/performance'
import { canManagePerformance } from '@/lib/performance/rules'
import { createServiceClient } from '@/lib/supabase/server'
import { PageShell } from '@/components/layout/PageShell'
import { PerformanceTabs } from '@/components/performance/PerformanceTabs'
import { PerformanceManager } from '@/components/performance/PerformanceManager'

export const metadata: Metadata = { title: 'Targets & settings · Performance' }
export const dynamic = 'force-dynamic'

export default async function ManagePerformancePage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { org, role } = await getVerifiedWorkspace(orgSlug)
  const sales = await getSalesStructure(org.id)
  if (!canManagePerformance(role)) redirect(`/${orgSlug}/performance`)
  const service = createServiceClient()
  const [settings, targets, history, achievements, { data: members }, { data: teams }] = await Promise.all([
    getGamification(org.id), listTargets(org.id), targetHistory(org.id), getAchievements(org.id, null),
    service.from('org_members').select('profile_id, role, profiles!org_members_profile_id_fkey(full_name)').eq('org_id', org.id).eq('status', 'active'),
    service.from('teams').select('id, name').eq('org_id', org.id).order('name'),
  ])
  const people = ((members ?? []) as unknown as { profile_id: string; role: string; profiles: { full_name: string | null } | null }[])
    .filter((m) => m.role !== 'readonly').map((m) => ({ id: m.profile_id, name: m.profiles?.full_name?.trim() || 'Team member' }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const names = Object.fromEntries(people.map((p) => [p.id, p.name]))
  const teamList = ((teams ?? []) as { id: string; name: string }[])
  return (
    <PageShell title="Targets & settings" description="Set goals, decide what earns points and what colleagues see of each other. Every change is kept and audited.">
      <PerformanceTabs orgSlug={orgSlug} current="manage" canManage watchesTeam={watchesTeam(role)} sellsPersonally={sellsPersonally(role, sales)} />
      <PerformanceManager orgId={org.id} settings={settings} targets={targets} people={people} teams={teamList}
        achievements={achievements.map((a) => ({ key: a.key, title: a.title, description: a.description, metric: a.metric, threshold: a.threshold, window: a.window, xp: a.xp, icon: a.icon, custom: a.custom, active: a.active, rewardNote: a.rewardNote }))}
        history={history.map((h) => ({
          id: h.id, action: h.action, when: h.changed_at, by: h.profiles?.full_name ?? 'Someone',
          what: describe(h.after ?? h.before, names, teamList),
          change: h.action === 'changed' && h.before && h.after && String(h.before.amount) !== String(h.after.amount) ? `${Number(h.before.amount)} → ${Number(h.after.amount)}` : null,
        }))} />
    </PageShell>
  )
}

function describe(t: Record<string, unknown> | null, names: Record<string, string>, teams: { id: string; name: string }[]): string {
  if (!t) return 'Target'
  const who = t.scope === 'member' ? names[String(t.profile_id)] ?? 'A person' : t.scope === 'team' ? teams.find((x) => x.id === t.team_id)?.name ?? 'A team' : 'Everyone'
  return `${who} · ${String(t.period)} ${String(t.metric).replace('_', ' ')} ${Number(t.amount)}`
}
