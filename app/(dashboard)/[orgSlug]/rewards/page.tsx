// app/(dashboard)/[orgSlug]/rewards/page.tsx — Rewards (20260100): the programmes a workspace runs (gadgets, trips, gift
// cards, cash bonuses, anything else), each person's progress from real CRM work, who has won, and the decisions waiting
// — approve, reject, mark as given, mark as received. Owners, admins and managers set programmes up and decide; everyone
// who sells sees the programmes open to them and their own rewards. Winners are found by the database, never typed in.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getSalesStructure } from '@/lib/dal/sales-structure'
import { listClaims, listPrograms, standings, type Standing } from '@/lib/dal/rewards'
import { listTeamStructure } from '@/lib/dal/teams'
import { teamIdsOf } from '@/lib/dal/viewer'
import { canManageRewards } from '@/lib/rewards/rules'
import { canTakeLeads } from '@/lib/sales/structure'
import { PageShell } from '@/components/layout/PageShell'
import { RewardsClient } from '@/components/rewards/RewardsClient'

export const metadata: Metadata = { title: 'Rewards' }
export const dynamic = 'force-dynamic'

export default async function RewardsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { org, role, profile } = await getVerifiedWorkspace(orgSlug)
  if (role === 'readonly' || role === 'post_sales') notFound()
  const manager = canManageRewards(role)
  const sales = await getSalesStructure(org.id)
  const sells = canTakeLeads(role, sales)
  const [programs, myTeams, teams] = await Promise.all([
    listPrograms(org.id), teamIdsOf(org.id, profile.id), sales.teamsEnabled ? listTeamStructure(org.id) : Promise.resolve([]),
  ])
  // A seller sees the programmes open to them (their role, or one of their teams); managers see them all.
  const visible = programs.filter((p) => manager || (p.status !== 'draft' && (p.scope === 'team'
    ? p.eligibleTeamIds.length === 0 ? myTeams.length > 0 : p.eligibleTeamIds.some((t) => myTeams.includes(t))
    : sells && p.eligibleRoles.includes(role) && (p.eligibleTeamIds.length === 0 || p.eligibleTeamIds.some((t) => myTeams.includes(t))))))
  const running = visible.filter((p) => p.status === 'active')
  const table = new Map<string, Standing[]>()
  await Promise.all(running.slice(0, 30).map(async (p) => table.set(p.id, await standings(p.id))))
  const progress = Object.fromEntries(running.map((p) => {
    const all = table.get(p.id) ?? []
    const mine = all.find((s) => (p.scope === 'person' ? s.profileId === profile.id : !!s.teamId && myTeams.includes(s.teamId))) ?? null
    return [p.id, { mine, top: manager ? all.slice(0, 5) : [], rank: mine ? all.findIndex((s) => s === mine) + 1 : null, entrants: all.length }]
  }))
  const claims = await listClaims(org.id, manager ? {} : { profileId: profile.id, teamIds: myTeams })

  return (
    <PageShell title="Rewards" description={manager ? 'Incentives for real results: set a reward, a goal and a deadline. RE by PX finds the winners from CRM records; you approve and hand them over.' : 'Rewards you can win from your work in RE by PX, and the ones you have won.'}>
      <RewardsClient orgId={org.id} manager={manager} profileId={profile.id} myTeamIds={myTeams}
        programs={visible} progress={progress} claims={claims}
        teams={teams.filter((t) => t.isActive).map((t) => ({ id: t.id, name: t.name }))} teamsEnabled={sales.teamsEnabled} />
    </PageShell>
  )
}
