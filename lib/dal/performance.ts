// lib/dal/performance.ts — reads and writes for sales performance (20260094; rules in lib/performance/rules.ts).
// Everything reads the event ledger (public.performance_events), which only the database writes from real CRM events.
// Callers have already authorised the workspace; owner/admin-only writes are checked again in the API routes.
import { getSalesStructure } from '@/lib/dal/sales-structure'
import { canTakeLeads } from '@/lib/sales/structure'
import type { MemberRole } from '@/types/database'
import { fmtDeals } from '@/lib/sales/deal-credit'
import { createServiceClient } from '@/lib/supabase/server'
import {
  BUILTIN_ACHIEVEMENTS, METRICS, gamificationFromStored, gamificationToStored, levelFor, periodWindow,
  type AchievementMetric, type GamificationSettings, type Metric, type Period,
} from '@/lib/performance/rules'

// The performance tables are not in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as unknown as { from: (t: string) => any; rpc: (f: string, a: Record<string, unknown>) => any }

interface EventRow { profile_id: string; kind: string; units: number; value: number | string; xp: number; occurred_at: string; detail: Record<string, unknown> | null; credit?: number | string | null }
/** `closed` is deal credit (fractional when a deal is shared, 20260098); `deals` is actual deals closed, each counted once. */
export type Totals = Record<Metric | 'xp' | 'missions' | 'targets' | 'deals', number>

const KIND_OF: Record<string, keyof Totals | null> = {
  lead_assigned: 'assigned', first_contact: 'contacted', follow_up_done: 'follow_ups', visit_done: 'meetings',
  mission: 'missions', target_hit: 'targets', deal_closed: null, deal_reversed: null, deal_credit: null, revenue: null,
}
const empty = (): Totals => ({ assigned: 0, contacted: 0, follow_ups: 0, meetings: 0, closed: 0, revenue: 0, xp: 0, missions: 0, targets: 0, deals: 0 })

/** Adds events into per-person totals (the same sums as gam_metric in the database). */
export function tally(rows: EventRow[]): Map<string, Totals> {
  const out = new Map<string, Totals>()
  for (const r of rows) {
    const t = out.get(r.profile_id) ?? empty()
    t.xp += r.xp
    const k = KIND_OF[r.kind]
    if (k) t[k] += r.units
    if (r.kind === 'deal_closed' || r.kind === 'deal_reversed') {
      t.deals += r.units
      // Before 20260098 rows had no credit; a booking was worth its units.
      t.closed += r.credit === undefined || r.credit === null ? r.units : Number(r.credit)
    }
    if (r.kind === 'deal_credit') t.closed += Number(r.credit ?? 0)
    if (r.kind === 'revenue' || r.kind === 'deal_credit') t.revenue += Number(r.value)
    t.closed = Math.round(t.closed * 10000) / 10000
    out.set(r.profile_id, t)
  }
  return out
}

async function events(orgId: string, from: Date | null, to: Date | null, profileId?: string): Promise<EventRow[]> {
  const rows: EventRow[] = []
  for (let page = 0; page < 50; page++) {
    let q = db().from('performance_events').select('profile_id, kind, units, value, xp, occurred_at, detail, credit').eq('org_id', orgId)
    if (from) q = q.gte('occurred_at', from.toISOString())
    if (to) q = q.lt('occurred_at', to.toISOString())
    if (profileId) q = q.eq('profile_id', profileId)
    const { data, error } = await q.order('occurred_at', { ascending: true }).range(page * 1000, page * 1000 + 999)
    if (error) throw new Error(`performance events: ${error.message}`)
    rows.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  return rows
}

export async function getGamification(orgId: string): Promise<GamificationSettings> {
  const { data } = await db().from('org_settings').select('gamification').eq('org_id', orgId).maybeSingle()
  return gamificationFromStored(data?.gamification)
}

export async function saveGamification(orgId: string, actorId: string, s: GamificationSettings): Promise<boolean> {
  const { error } = await db().from('org_settings').upsert({ org_id: orgId, gamification: gamificationToStored(s), updated_by: actorId, updated_at: new Date().toISOString() }, { onConflict: 'org_id' })
  return !error
}

export async function orgTimezone(orgId: string): Promise<string> {
  const { data } = await db().from('lead_response_settings').select('timezone').eq('org_id', orgId).maybeSingle()
  return data?.timezone ?? 'Asia/Kolkata'
}

// ── Targets ─────────────────────────────────────────────────────────────────────────────────────────────────────
export interface TargetRow {
  id: string; scope: 'member' | 'team' | 'everyone'; profile_id: string | null; team_id: string | null
  metric: Metric; amount: number; period: Period; starts_on: string; ends_on: string | null; archived_at: string | null; updated_at: string
}

export async function listTargets(orgId: string, { includeArchived = false } = {}): Promise<TargetRow[]> {
  let q = db().from('performance_targets').select('id, scope, profile_id, team_id, metric, amount, period, starts_on, ends_on, archived_at, updated_at').eq('org_id', orgId)
  if (!includeArchived) q = q.is('archived_at', null)
  const { data } = await q.order('created_at', { ascending: false }).limit(500)
  return ((data ?? []) as TargetRow[]).map((t) => ({ ...t, amount: Number(t.amount) }))
}

/** The targets that apply to a person today: their own over their team's over everyone's, per metric and period. */
export function targetsFor(all: TargetRow[], profileId: string, teamIds: string[], today: string): TargetRow[] {
  const rank = (t: TargetRow) => (t.scope === 'member' ? 0 : t.scope === 'team' ? 1 : 2)
  const live = all.filter((t) => !t.archived_at && t.starts_on <= today && (!t.ends_on || t.ends_on >= today)
    && (t.profile_id === profileId || t.scope === 'everyone' || (t.team_id !== null && teamIds.includes(t.team_id))))
  const best = new Map<string, TargetRow>()
  for (const t of live.sort((a, b) => rank(a) - rank(b) || b.updated_at.localeCompare(a.updated_at))) {
    const k = `${t.metric}:${t.period}`
    if (!best.has(k)) best.set(k, t)
  }
  return [...best.values()]
}

export function targetWindow(t: Pick<TargetRow, 'period' | 'starts_on' | 'ends_on'>, now: Date, tz: string): { from: Date; to: Date } {
  if (t.period !== 'custom') return periodWindow(t.period, now, tz)
  const at = (d: string) => periodWindow('day', new Date(`${d}T12:00:00Z`), tz).from
  const end = at(t.ends_on ?? t.starts_on)
  return { from: at(t.starts_on), to: new Date(end.getTime() + 86_400_000) }
}

async function teamsOf(orgId: string, profileId: string): Promise<string[]> {
  const { data } = await db().from('team_members').select('team_id').eq('org_id', orgId).eq('profile_id', profileId)
  return ((data ?? []) as { team_id: string }[]).map((r) => r.team_id)
}

export interface TargetProgress { id: string; metric: Metric; period: Period; amount: number; done: number; pct: number; ends: string; scope: TargetRow['scope'] }

async function progressFor(orgId: string, profileId: string, targets: TargetRow[], now: Date, tz: string): Promise<TargetProgress[]> {
  const out: TargetProgress[] = []
  for (const t of targets) {
    const w = targetWindow(t, now, tz)
    const totals = tally(await events(orgId, w.from, w.to, profileId)).get(profileId) ?? empty()
    const done = totals[t.metric]
    out.push({ id: t.id, metric: t.metric, period: t.period, amount: t.amount, done, pct: Math.min(100, Math.round((done / t.amount) * 100)), ends: w.to.toISOString(), scope: t.scope })
  }
  return out.sort((a, b) => b.pct - a.pct)
}

// ── A person's performance ──────────────────────────────────────────────────────────────────────────────────────
export interface MyPerformance {
  settings: GamificationSettings
  xp: number
  level: ReturnType<typeof levelFor>
  today: Totals; week: Totals; month: Totals
  conversionPct: number | null
  pendingContacts: number; upcomingFollowUps: number
  targets: TargetProgress[]
  overallTargetPct: number | null
  missions: { key: string; title: string; metric: Metric; count: number; xp: number; done: number; complete: boolean }[]
  recentUnlocks: { key: string; title: string; xp: number; unlocked_at: string }[]
  history: { date: string; xp: number }[]
  next: string
}

export async function getMyPerformance(orgId: string, profileId: string, now = new Date()): Promise<MyPerformance> {
  const [settings, tz] = await Promise.all([getGamification(orgId), orgTimezone(orgId)])
  const day = periodWindow('day', now, tz), week = periodWindow('week', now, tz), month = periodWindow('month', now, tz)
  const historyFrom = new Date(day.from.getTime() - 29 * 86_400_000)
  const [allTime, recent, teamIds, targets, unlocks, pending, upcoming] = await Promise.all([
    events(orgId, null, null, profileId),
    events(orgId, historyFrom < month.from ? historyFrom : month.from, null, profileId),
    teamsOf(orgId, profileId),
    listTargets(orgId),
    db().from('achievement_unlocks').select('key, title, xp, unlocked_at').eq('org_id', orgId).eq('profile_id', profileId).order('unlocked_at', { ascending: false }).limit(6),
    db().from('leads').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('assigned_to', profileId).eq('status', 'new').is('first_action_at', null),
    db().from('lead_tasks').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('assigned_to', profileId).eq('status', 'open').gte('due_at', now.toISOString()),
  ])
  const within = (w: { from: Date; to: Date }) => recent.filter((e) => { const t = new Date(e.occurred_at); return t >= w.from && t < w.to })
  const tot = (rows: EventRow[]) => tally(rows).get(profileId) ?? empty()
  const xp = tot(allTime).xp
  const todayT = tot(within(day)), weekT = tot(within(week)), monthT = tot(within(month))
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now)
  const mine = targetsFor(targets, profileId, teamIds, todayKey)
  const progress = await progressFor(orgId, profileId, mine, now, tz)
  const missions = settings.enabled ? settings.missions.map((m) => {
    const done = todayT[m.metric]
    return { ...m, done, complete: done >= m.count }
  }) : []
  const byDay = new Map<string, number>()
  for (const e of recent) {
    if (new Date(e.occurred_at) < historyFrom) continue
    const k = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(e.occurred_at))
    byDay.set(k, (byDay.get(k) ?? 0) + e.xp)
  }
  const history = Array.from({ length: 30 }, (_, i) => {
    const d = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(day.from.getTime() - (29 - i) * 86_400_000 + 43_200_000))
    return { date: d, xp: byDay.get(d) ?? 0 }
  })
  const pendingCount = pending.count ?? 0
  const openMission = missions.find((m) => !m.complete)
  const behind = progress.filter((p) => p.pct < 100).sort((a, b) => a.pct - b.pct)[0]
  const next = pendingCount > 0 ? `Call your ${pendingCount} waiting lead${pendingCount === 1 ? '' : 's'} first — every first contact counts.`
    : openMission ? `Today’s mission: ${openMission.title} (${openMission.done} of ${openMission.count}).`
    : behind ? `${METRICS[behind.metric].label}: ${fmtAmount(behind.metric, behind.amount - behind.done)} to go for your ${behind.period === 'day' ? 'daily' : behind.period === 'week' ? 'weekly' : behind.period === 'month' ? 'monthly' : ''} target.`
    : 'You are on top of everything. Follow up a qualified lead to move it towards a booking.'
  return {
    settings, xp, level: levelFor(xp, settings.levels), today: todayT, week: weekT, month: monthT,
    conversionPct: monthT.assigned > 0 ? Math.round((monthT.deals / monthT.assigned) * 100) : null,
    pendingContacts: pendingCount, upcomingFollowUps: upcoming.count ?? 0,
    targets: progress, overallTargetPct: progress.length ? Math.round(progress.reduce((s, p) => s + p.pct, 0) / progress.length) : null,
    missions, recentUnlocks: unlocks.data ?? [], history, next,
  }
}

export function fmtAmount(metric: Metric, n: number): string {
  if (metric === 'closed') return `${fmtDeals(n)} ${METRICS[metric].unit}`
  if (metric !== 'revenue') return `${Math.max(0, Math.round(n))} ${METRICS[metric].unit}`
  const v = Math.max(0, n)
  return v >= 1e7 ? `₹${+(v / 1e7).toFixed(2)} Cr` : v >= 1e5 ? `₹${+(v / 1e5).toFixed(1)} L` : `₹${Math.round(v).toLocaleString('en-IN')}`
}

// ── Leaderboard ─────────────────────────────────────────────────────────────────────────────────────────────────
export interface LeaderRow {
  profileId: string; name: string; avatarUrl: string | null; rank: number
  /** closed = deal credit (fractional when shared); deals = actual deals; conversionPct = deals ÷ leads assigned in the period. */
  xp: number; contacted: number; closed: number; deals: number; conversionPct: number | null; revenue: number; targetPct: number | null
  previousXp: number; gapToNext: number | null
}

/** Who ranks: everyone who sells — admins, managers, team leads and sales executives with activity or targets, and the
 * owner only while owners sell. */
export async function getLeaderboard(orgId: string, window: { from: Date; to: Date }, now = new Date()): Promise<LeaderRow[]> {
  const tz = await orgTimezone(orgId)
  const span = window.to.getTime() - window.from.getTime()
  const prev = { from: new Date(window.from.getTime() - span), to: window.from }
  const [cur, before, { data: members }, targets, { data: teamRows }, sales] = await Promise.all([
    events(orgId, window.from, window.to), events(orgId, prev.from, prev.to),
    db().from('org_members').select('profile_id, role, profiles!org_members_profile_id_fkey(full_name, avatar_url)').eq('org_id', orgId).eq('status', 'active')
      .in('role', ['owner', 'admin', 'manager', 'team_lead', 'sales_exec']),
    listTargets(orgId),
    db().from('team_members').select('team_id, profile_id').eq('org_id', orgId),
    getSalesStructure(orgId),
  ])
  const now_ = tally(cur), was = tally(before)
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now)
  const rows: LeaderRow[] = []
  for (const m of (members ?? []) as { profile_id: string; role: string; profiles: { full_name: string | null; avatar_url: string | null } | null }[]) {
    const t = now_.get(m.profile_id) ?? empty()
    const teams = ((teamRows ?? []) as { team_id: string; profile_id: string }[]).filter((r) => r.profile_id === m.profile_id).map((r) => r.team_id)
    const mine = targetsFor(targets, m.profile_id, teams, todayKey)
    // Activity in the period, a target, or a seller's role: managers with nothing to show stay off the board.
    if (!now_.has(m.profile_id) && !mine.length && !['sales_exec', 'team_lead'].includes(m.role)) continue
    // An owner who only manages is not on the sales board (Settings → Sales structure); their history stays.
    if (!canTakeLeads(m.role as MemberRole, sales)) continue
    const pcts = mine.map((tg) => Math.min(100, (t[tg.metric] / tg.amount) * 100))
    rows.push({
      profileId: m.profile_id, name: m.profiles?.full_name?.trim() || 'Team member', avatarUrl: m.profiles?.avatar_url ?? null, rank: 0,
      xp: t.xp, contacted: t.contacted, closed: t.closed, deals: t.deals, conversionPct: t.assigned > 0 ? Math.round((t.deals / t.assigned) * 100) : null, revenue: t.revenue,
      targetPct: pcts.length ? Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length) : null,
      previousXp: (was.get(m.profile_id) ?? empty()).xp, gapToNext: null,
    })
  }
  // XP first; ties broken by deals, then contacts, then name — so a rank never depends on the order rows were read.
  rows.sort((a, b) => b.xp - a.xp || b.closed - a.closed || b.contacted - a.contacted || a.name.localeCompare(b.name))
  rows.forEach((r, i) => {
    r.rank = i > 0 && rows[i - 1].xp === r.xp && rows[i - 1].closed === r.closed && rows[i - 1].contacted === r.contacted ? rows[i - 1].rank : i + 1
    r.gapToNext = i > 0 ? Math.max(0, rows[i - 1].xp - r.xp) : null
  })
  return rows
}

// ── Achievements ────────────────────────────────────────────────────────────────────────────────────────────────
export interface AchievementView {
  key: string; title: string; description: string; metric: AchievementMetric; threshold: number; window: 'all' | 'week' | 'month'
  xp: number; icon: string; custom: boolean; active: boolean; rewardNote: string | null
  /** First unlock; times = how many windows it was won in (a weekly challenge can be won every week). */
  unlockedAt: string | null; times: number
  /** Towards the threshold in the current window: all time, this week, or this month (workspace time zone). */
  progress: number
  /** A weekly or monthly one already won in the current week or month. */
  doneThisPeriod: boolean
}

export async function getAchievements(orgId: string, profileId: string | null, now = new Date()): Promise<AchievementView[]> {
  const tz = await orgTimezone(orgId)
  const win = { week: periodWindow('week', now, tz), month: periodWindow('month', now, tz) }
  const [{ data: defs }, { data: unlocks }, rows] = await Promise.all([
    db().from('achievement_defs').select('key, title, description, metric, threshold, window_kind, xp, icon, reward_note, active').eq('org_id', orgId),
    profileId ? db().from('achievement_unlocks').select('key, unlocked_at').eq('org_id', orgId).eq('profile_id', profileId).order('unlocked_at') : Promise.resolve({ data: [] }),
    profileId ? events(orgId, null, null, profileId) : Promise.resolve([] as EventRow[]),
  ])
  const within = (w: { from: Date; to: Date }) => rows.filter((r) => { const t = new Date(r.occurred_at).getTime(); return t >= w.from.getTime() && t < w.to.getTime() })
  const totals: Record<'all' | 'week' | 'month', Totals> = {
    all: (profileId && tally(rows).get(profileId)) || empty(),
    week: (profileId && tally(within(win.week)).get(profileId)) || empty(),
    month: (profileId && tally(within(win.month)).get(profileId)) || empty(),
  }
  const own = new Map(((defs ?? []) as { key: string; title: string; description: string; metric: AchievementMetric; threshold: number | string; window_kind: 'all' | 'week' | 'month'; xp: number; icon: string; reward_note: string | null; active: boolean }[]).map((d) => [d.key, d]))
  const u = (unlocks ?? []) as { key: string; unlocked_at: string }[]
  const view = (key: string, base: Omit<AchievementView, 'unlockedAt' | 'times' | 'progress' | 'key' | 'doneThisPeriod'>): AchievementView => {
    const mine = u.filter((x) => x.key === key)
    const have = (totals[base.window] as Record<string, number>)[base.metric] ?? 0
    const current = base.window === 'all' ? null : win[base.window]
    const doneThisPeriod = !!current && mine.some((x) => { const t = new Date(x.unlocked_at).getTime(); return t >= current.from.getTime() && t < current.to.getTime() })
    return { key, ...base, unlockedAt: mine[0]?.unlocked_at ?? null, times: mine.length, progress: doneThisPeriod ? 1 : Math.min(1, have / base.threshold), doneThisPeriod }
  }
  const out: AchievementView[] = []
  for (const b of BUILTIN_ACHIEVEMENTS) {
    const o = own.get(b.key)
    out.push(view(b.key, { title: b.title, description: b.description, metric: b.metric, threshold: b.threshold, window: b.window, xp: b.xp, icon: b.icon, custom: false, active: !o, rewardNote: null }))
  }
  for (const d of own.values()) {
    if (BUILTIN_ACHIEVEMENTS.some((b) => b.key === d.key)) continue
    out.push(view(d.key, { title: d.title, description: d.description, metric: d.metric, threshold: Number(d.threshold), window: d.window_kind, xp: d.xp, icon: d.icon, custom: true, active: d.active, rewardNote: d.reward_note }))
  }
  return out
}

export async function targetHistory(orgId: string, limit = 30) {
  const { data } = await db().from('performance_target_history').select('id, target_id, action, before, after, changed_at, profiles!performance_target_history_changed_by_fkey(full_name)')
    .eq('org_id', orgId).order('changed_at', { ascending: false }).limit(limit)
  return (data ?? []) as { id: number; target_id: string; action: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null; changed_at: string; profiles: { full_name: string | null } | null }[]
}

export { db as performanceDb }
