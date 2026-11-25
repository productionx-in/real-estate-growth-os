// lib/teams/structure.ts — team structure (20260097): a team's numbers, how teams rank, and team achievements. Pure,
// so the Teams page, Performance and the tests share one definition. A team's numbers are the sum of its current
// members' recorded work (the event ledger, 20260094) — nothing is typed in, and moving someone moves their numbers.
import type { MemberRole } from '@/types/database'

/** Who creates and changes teams (the API authorises; the UI only hides). */
export const TEAM_MANAGERS = ['owner', 'admin', 'manager'] as const satisfies readonly MemberRole[]
export const LEADER_ROLES: readonly MemberRole[] = ['owner', 'admin', 'manager', 'team_lead']
export const MAX_TEAMS = 50
export const MAX_PROJECTS_PER_TEAM = 50

/** `closed` is deal credit (fractional when a deal is shared, 20260098); `deals` counts actual deals closed. */
export interface MemberTotals { assigned: number; contacted: number; follow_ups: number; meetings: number; closed: number; revenue: number; xp: number; deals: number }
export interface TeamTotals extends MemberTotals { members: number; conversionPct: number | null }

export function teamTotals(memberIds: string[], per: Map<string, Partial<MemberTotals>>): TeamTotals {
  const people = new Set(memberIds)
  const t: TeamTotals = { members: people.size, assigned: 0, contacted: 0, follow_ups: 0, meetings: 0, closed: 0, revenue: 0, xp: 0, deals: 0, conversionPct: null }
  for (const id of people) {
    const m = per.get(id); if (!m) continue
    t.assigned += m.assigned ?? 0; t.contacted += m.contacted ?? 0; t.follow_ups += m.follow_ups ?? 0
    t.meetings += m.meetings ?? 0; t.closed += m.closed ?? 0; t.revenue += m.revenue ?? 0; t.xp += m.xp ?? 0; t.deals += m.deals ?? 0
  }
  t.closed = Math.round(t.closed * 10000) / 10000
  t.conversionPct = t.assigned > 0 ? Math.round((t.deals / t.assigned) * 100) : null
  return t
}

/**
 * Team ranking: deals closed first, then revenue, then points per member (so a big team does not win on size alone
 * for effort), then name. Equal on all three numbers share a rank.
 */
export function rankTeams<T extends { name: string; totals: TeamTotals }>(teams: T[]): (T & { rank: number; xpPerMember: number })[] {
  const rows = teams.map((t) => ({ ...t, xpPerMember: t.totals.members ? Math.round(t.totals.xp / t.totals.members) : 0, rank: 0 }))
  rows.sort((a, b) => b.totals.closed - a.totals.closed || b.totals.revenue - a.totals.revenue || b.xpPerMember - a.xpPerMember || a.name.localeCompare(b.name))
  const same = (a: (typeof rows)[number], b: (typeof rows)[number]) => a.totals.closed === b.totals.closed && a.totals.revenue === b.totals.revenue && a.xpPerMember === b.xpPerMember
  rows.forEach((r, i) => { r.rank = i > 0 && same(rows[i - 1], r) ? rows[i - 1].rank : i + 1 })
  return rows
}

/** Team achievements: milestones a team reaches together, from its members' all-time work. */
export const TEAM_ACHIEVEMENTS = [
  { key: 'team_first_booking', title: 'First booking together', metric: 'closed', threshold: 1, icon: 'trophy' },
  { key: 'team_10_bookings', title: '10 bookings', metric: 'closed', threshold: 10, icon: 'medal' },
  { key: 'team_50_bookings', title: '50 bookings', metric: 'closed', threshold: 50, icon: 'crown' },
  { key: 'team_100_visits', title: '100 site visits', metric: 'meetings', threshold: 100, icon: 'map-pin' },
  { key: 'team_1000_contacts', title: '1,000 leads contacted', metric: 'contacted', threshold: 1000, icon: 'phone' },
  { key: 'team_1cr', title: '₹1 crore booked', metric: 'revenue', threshold: 1e7, icon: 'gem' },
  { key: 'team_10cr', title: '₹10 crore booked', metric: 'revenue', threshold: 1e8, icon: 'rocket' },
] as const satisfies readonly { key: string; title: string; metric: keyof MemberTotals; threshold: number; icon: string }[]

export function teamAchievements(allTime: MemberTotals): { key: string; title: string; icon: string; unlocked: boolean; progress: number; threshold: number; metric: keyof MemberTotals }[] {
  return TEAM_ACHIEVEMENTS.map((a) => {
    const have = allTime[a.metric] ?? 0
    return { key: a.key, title: a.title, icon: a.icon, metric: a.metric, threshold: a.threshold, unlocked: have >= a.threshold, progress: Math.min(1, have / a.threshold) }
  })
}

export interface TeamInput { name: string; leaderProfileId: string | null; projectIds: string[]; memberIds: string[]; description: string | null }

/** Checks a team someone entered: a name, at most 50 projects, no duplicates; the database checks ownership again. */
export function normaliseTeam(v: Record<string, unknown>): { value: TeamInput; error: string | null } {
  const name = typeof v.name === 'string' ? v.name.replace(/\s+/g, ' ').trim() : ''
  const ids = (x: unknown) => (Array.isArray(x) ? [...new Set(x.filter((s): s is string => typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s)))] : [])
  const value: TeamInput = {
    name, description: typeof v.description === 'string' && v.description.trim() ? v.description.trim().slice(0, 500) : null,
    leaderProfileId: typeof v.leaderProfileId === 'string' && /^[0-9a-f-]{36}$/i.test(v.leaderProfileId) ? v.leaderProfileId : null,
    projectIds: ids(v.projectIds), memberIds: ids(v.memberIds),
  }
  if (name.length < 1 || name.length > 80) return { value, error: 'Give the team a name (up to 80 characters).' }
  if (value.projectIds.length > MAX_PROJECTS_PER_TEAM) return { value, error: `A team can have at most ${MAX_PROJECTS_PER_TEAM} projects.` }
  return { value, error: null }
}
