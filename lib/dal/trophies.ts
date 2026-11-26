// lib/dal/trophies.ts — trophies (20260099): the top three people and teams of each finished week and month, awarded
// once by the database after the period closes (award_due_trophies, daily). Read-only here; scoped by organisation.
import { createServiceClient } from '@/lib/supabase/server'

// performance_trophies is not in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as unknown as { from: (t: string) => any }

export interface Trophy {
  id: string; periodKind: 'week' | 'month'; periodStart: string; scope: 'person' | 'team'; place: 1 | 2 | 3
  profileId: string | null; teamId: string | null; name: string; xp: number; closed: number; revenue: number; awardedAt: string
}

const map = (r: Record<string, unknown>): Trophy => ({
  id: r.id as string, periodKind: r.period_kind as Trophy['periodKind'], periodStart: r.period_start as string, scope: r.scope as Trophy['scope'],
  place: r.place as Trophy['place'], profileId: (r.profile_id as string | null) ?? null, teamId: (r.team_id as string | null) ?? null,
  name: r.name as string, xp: r.xp as number, closed: Number(r.closed), revenue: Number(r.revenue), awardedAt: r.awarded_at as string,
})
const COLS = 'id, period_kind, period_start, scope, place, profile_id, team_id, name, xp, closed, revenue, awarded_at'

/** One person's trophies, and those of the teams given, newest first. */
export async function trophiesFor(orgId: string, profileId: string | null, teamIds: string[] = []): Promise<Trophy[]> {
  const out: Trophy[] = []
  if (profileId) {
    const { data } = await db().from('performance_trophies').select(COLS).eq('org_id', orgId).eq('profile_id', profileId).order('period_start', { ascending: false }).limit(60)
    out.push(...((data ?? []) as Record<string, unknown>[]).map(map))
  }
  if (teamIds.length) {
    const { data } = await db().from('performance_trophies').select(COLS).eq('org_id', orgId).in('team_id', teamIds).order('period_start', { ascending: false }).limit(60)
    out.push(...((data ?? []) as Record<string, unknown>[]).map(map))
  }
  return out.sort((a, b) => b.periodStart.localeCompare(a.periodStart) || a.place - b.place)
}

/** The latest finished week's and month's winners in the workspace (for the leaderboard). */
export async function latestWinners(orgId: string): Promise<{ week: Trophy[]; month: Trophy[] }> {
  const { data } = await db().from('performance_trophies').select(COLS).eq('org_id', orgId).order('period_start', { ascending: false }).limit(40)
  const all = ((data ?? []) as Record<string, unknown>[]).map(map)
  const latest = (kind: Trophy['periodKind']) => {
    const start = all.find((t) => t.periodKind === kind)?.periodStart
    return all.filter((t) => t.periodKind === kind && t.periodStart === start).sort((a, b) => (a.scope === b.scope ? a.place - b.place : a.scope === 'person' ? -1 : 1))
  }
  return { week: latest('week'), month: latest('month') }
}

/** "Week of 17 Nov" / "October 2026". */
export function periodLabel(t: Pick<Trophy, 'periodKind' | 'periodStart'>): string {
  const d = new Date(`${t.periodStart}T00:00:00Z`)
  return t.periodKind === 'week'
    ? `Week of ${new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d)}`
    : new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d)
}
