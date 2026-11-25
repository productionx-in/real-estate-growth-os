// lib/dal/team-overview.ts — the management view of sales performance (Performance → Team overview): one row per person
// who sells, for a period, plus totals. Read from the event ledger (20260094) and live lead state; nothing typed in.
// Who appears follows the workspace's rules (lib/sales/structure.ts): an owner who does not sell is not a row.
// Callers authorise: owners, admins and managers see everyone; a team lead passes their team's profile ids.
import { createServiceClient } from '@/lib/supabase/server'
import { getGamification, listTargets, orgTimezone, performanceDb as db, tally, targetsFor } from '@/lib/dal/performance'
import { getSalesStructure } from '@/lib/dal/sales-structure'
import { canTakeLeads } from '@/lib/sales/structure'
import { levelFor, periodWindow } from '@/lib/performance/rules'
import type { MemberRole } from '@/types/database'

export const OVERVIEW_PERIODS = { week: 'This week', month: 'This month', quarter: 'This quarter' } as const
export type OverviewPeriod = keyof typeof OVERVIEW_PERIODS

export interface OverviewRow {
  profileId: string; name: string; role: MemberRole; teams: string[]
  level: string; xp: number
  assigned: number; contacted: number; followUps: number; visits: number; closed: number; revenue: number; periodXp: number
  conversionPct: number | null
  openLeads: number; waitingFirstCall: number; overdueFollowUps: number
  targetPct: number | null; achievements: number
}
export interface TeamOverview { period: OverviewPeriod; from: Date; to: Date; rows: OverviewRow[]; unassigned: number; totals: Omit<OverviewRow, 'profileId' | 'name' | 'role' | 'teams' | 'level' | 'xp' | 'targetPct' | 'achievements'> & { people: number } }

export function overviewWindow(period: OverviewPeriod, now: Date, tz: string): { from: Date; to: Date } {
  if (period !== 'quarter') return periodWindow(period, now, tz)
  const m = periodWindow('month', now, tz)
  const local = new Date(now.toLocaleString('en-US', { timeZone: tz }))
  const back = local.getMonth() % 3 // months since the quarter began (Jan/Apr/Jul/Oct)
  const from = new Date(m.from); from.setMonth(from.getMonth() - back)
  return { from, to: m.to }
}

const count = (rows: { assigned_to: string | null }[] | null) => {
  const out = new Map<string, number>()
  for (const r of rows ?? []) if (r.assigned_to) out.set(r.assigned_to, (out.get(r.assigned_to) ?? 0) + 1)
  return out
}

export async function getTeamOverview(orgId: string, period: OverviewPeriod, only: string[] | null, now = new Date()): Promise<TeamOverview> {
  const svc = createServiceClient()
  const [tz, sales, settings] = await Promise.all([orgTimezone(orgId), getSalesStructure(orgId), getGamification(orgId)])
  const w = overviewWindow(period, now, tz)
  let mq = svc.from('org_members').select('profile_id, role, profiles!org_members_profile_id_fkey(full_name)').eq('org_id', orgId).eq('status', 'active')
    .in('role', ['owner', 'admin', 'manager', 'team_lead', 'sales_exec'])
  if (only) mq = mq.in('profile_id', only)
  const [{ data: members }, inWindow, allTime, open, waiting, overdue, targets, teamRows, unlocks, unassigned] = await Promise.all([
    mq,
    db().from('performance_events').select('profile_id, kind, units, value, xp, occurred_at, detail').eq('org_id', orgId).gte('occurred_at', w.from.toISOString()).lt('occurred_at', w.to.toISOString()).limit(20000),
    db().from('performance_events').select('profile_id, xp').eq('org_id', orgId).limit(50000),
    svc.from('leads').select('assigned_to').eq('org_id', orgId).not('assigned_to', 'is', null).not('status', 'in', '(booked,lost,junk)').limit(20000),
    svc.from('leads').select('assigned_to').eq('org_id', orgId).eq('status', 'new').is('first_action_at', null).not('assigned_to', 'is', null).limit(20000),
    svc.from('lead_tasks').select('assigned_to').eq('org_id', orgId).eq('status', 'open').lt('due_at', now.toISOString()).limit(20000),
    listTargets(orgId),
    svc.from('team_members').select('profile_id, team:teams!inner(id, name, is_active)').eq('org_id', orgId).eq('team.is_active', true),
    db().from('achievement_unlocks').select('profile_id').eq('org_id', orgId).limit(20000),
    only ? Promise.resolve({ count: 0 }) : svc.from('leads').select('id', { count: 'exact', head: true }).eq('org_id', orgId).is('assigned_to', null).not('status', 'in', '(booked,lost,junk)'),
  ])
  const period_ = tally((inWindow.data ?? []) as Parameters<typeof tally>[0])
  const xpAll = new Map<string, number>()
  for (const e of (allTime.data ?? []) as { profile_id: string; xp: number }[]) xpAll.set(e.profile_id, (xpAll.get(e.profile_id) ?? 0) + e.xp)
  const openBy = count(open.data), waitingBy = count(waiting.data), overdueBy = count(overdue.data)
  const unlockBy = new Map<string, number>()
  for (const u of (unlocks.data ?? []) as { profile_id: string }[]) unlockBy.set(u.profile_id, (unlockBy.get(u.profile_id) ?? 0) + 1)
  const teamsOf = new Map<string, { id: string; name: string }[]>()
  for (const r of (teamRows.data ?? []) as unknown as { profile_id: string; team: { id: string; name: string } }[]) teamsOf.set(r.profile_id, [...(teamsOf.get(r.profile_id) ?? []), r.team])
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now)

  const rows: OverviewRow[] = []
  for (const m of (members ?? []) as unknown as { profile_id: string; role: MemberRole; profiles: { full_name: string | null } | null }[]) {
    // People who sell; an owner only while the workspace lets owners sell. A non-selling owner's past numbers stay in
    // the ledger but they are not a row on a sales team's board.
    if (!canTakeLeads(m.role, sales)) continue
    const t = period_.get(m.profile_id)
    const mine = targetsFor(targets, m.profile_id, (teamsOf.get(m.profile_id) ?? []).map((x) => x.id), todayKey)
    const pcts = mine.map((tg) => Math.min(100, ((t?.[tg.metric] ?? 0) / tg.amount) * 100))
    const xp = xpAll.get(m.profile_id) ?? 0
    rows.push({
      profileId: m.profile_id, name: m.profiles?.full_name?.trim() || 'Team member', role: m.role, teams: (teamsOf.get(m.profile_id) ?? []).map((x) => x.name),
      level: levelFor(xp, settings.levels).level.name, xp,
      assigned: t?.assigned ?? 0, contacted: t?.contacted ?? 0, followUps: t?.follow_ups ?? 0, visits: t?.meetings ?? 0, closed: t?.closed ?? 0, revenue: t?.revenue ?? 0, periodXp: t?.xp ?? 0,
      conversionPct: t && t.assigned > 0 ? Math.round((t.closed / t.assigned) * 100) : null,
      openLeads: openBy.get(m.profile_id) ?? 0, waitingFirstCall: waitingBy.get(m.profile_id) ?? 0, overdueFollowUps: overdueBy.get(m.profile_id) ?? 0,
      targetPct: pcts.length ? Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length) : null,
      achievements: unlockBy.get(m.profile_id) ?? 0,
    })
  }
  rows.sort((a, b) => b.closed - a.closed || b.revenue - a.revenue || b.periodXp - a.periodXp || a.name.localeCompare(b.name))
  const sum = (k: keyof OverviewRow) => rows.reduce((s, r) => s + (r[k] as number), 0)
  const assigned = sum('assigned'), closed = sum('closed')
  return {
    period, from: w.from, to: w.to, rows, unassigned: unassigned.count ?? 0,
    totals: {
      people: rows.length, assigned, contacted: sum('contacted'), followUps: sum('followUps'), visits: sum('visits'), closed, revenue: sum('revenue'), periodXp: sum('periodXp'),
      conversionPct: assigned > 0 ? Math.round((closed / assigned) * 100) : null,
      openLeads: sum('openLeads'), waitingFirstCall: sum('waitingFirstCall'), overdueFollowUps: sum('overdueFollowUps'),
    },
  }
}

/** Achievements the team has unlocked: the latest, and per badge how many people hold it (for managers). */
export async function getTeamUnlocks(orgId: string, only: string[] | null): Promise<{ recent: { key: string; title: string; name: string; at: string }[]; holders: Map<string, number> }> {
  let q = db().from('achievement_unlocks').select('key, title, profile_id, unlocked_at, profiles!achievement_unlocks_profile_id_fkey(full_name)').eq('org_id', orgId).order('unlocked_at', { ascending: false }).limit(2000)
  if (only) q = q.in('profile_id', only)
  const { data } = await q
  const rows = (data ?? []) as { key: string; title: string; profile_id: string; unlocked_at: string; profiles: { full_name: string | null } | null }[]
  const holders = new Map<string, Set<string>>()
  for (const r of rows) holders.set(r.key, (holders.get(r.key) ?? new Set()).add(r.profile_id))
  return {
    recent: rows.slice(0, 12).map((r) => ({ key: r.key, title: r.title, name: r.profiles?.full_name?.trim() || 'Team member', at: r.unlocked_at })),
    holders: new Map([...holders.entries()].map(([k, v]) => [k, v.size])),
  }
}
