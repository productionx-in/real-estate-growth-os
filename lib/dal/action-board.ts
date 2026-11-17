// lib/dal/action-board.ts
// The home dashboard: what needs doing now, defined once so each number and the lead list it opens agree.
//   waiting      — open leads nobody has called or messaged yet (the list shows how urgent each is)
//   unassigned   — open leads nobody owns
//   overdue      — open leads whose next follow-up time has passed
//   no_next_step — leads past "new" with nothing scheduled (next_follow_up_at is empty)
//   visited      — visited the site, not booked yet
// Scope: a sales executive sees only their own leads; everyone else sees the organisation.
import { createServiceClient } from '@/lib/supabase/server'
import type { LeadStatus } from '@/types/database'
import { DEFAULT_RESPONSE_SETTINGS, LEAD_COLUMNS, tzOffsetMinutes, type MyDayLead } from './follow-ups'
import { CLOSED_STATUSES, IN_PROGRESS, FOCI, isFocus, applyFocus, type Focus } from '@/lib/leads/view-filters'
// The focus definitions live with the lead filters (client-safe); re-exported for existing callers.
export { CLOSED_STATUSES, FOCI, isFocus, applyFocus, type Focus }

export const FUNNEL: { status: LeadStatus; label: string }[] = [
  { status: 'new', label: 'New' }, { status: 'contacted', label: 'Contacted' }, { status: 'qualified', label: 'Qualified' },
  { status: 'site_visit_scheduled', label: 'Visit scheduled' }, { status: 'site_visited', label: 'Visited' },
  { status: 'negotiation', label: 'Negotiating' }, { status: 'booked', label: 'Booked' },
]

export const PERIODS = { today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days' } as const
export type Period = keyof typeof PERIODS

export async function getResponseMinutes(orgId: string): Promise<{ minutes: number; timezone: string }> {
  const db = createServiceClient()
  const { data } = await db.from('lead_response_settings').select('first_response_minutes, timezone').eq('org_id', orgId).maybeSingle()
  return {
    minutes: data?.first_response_minutes ?? DEFAULT_RESPONSE_SETTINGS.first_response_minutes,
    timezone: data?.timezone ?? DEFAULT_RESPONSE_SETTINGS.timezone,
  }
}

function startOf(period: Period, now: Date, timezone: string): Date {
  const localDay = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const midnight = new Date(Date.parse(`${localDay}T00:00:00.000Z`) - tzOffsetMinutes(timezone, now) * 60_000)
  const days = period === 'today' ? 0 : period === '7d' ? 6 : 29
  return new Date(midnight.getTime() - days * 86_400_000)
}

export interface TeamRow {
  profileId: string
  name: string
  role: string
  open: number
  waiting: number
  overdue: number
  noNextStep: number
  visitsToday: number
  bookings: number
}

export interface ActionBoard {
  period: Period
  responseMinutes: number
  timezone: string
  counts: Record<Focus, number> & { newLeads: number; visitsToday: number }
  waitingLeads: MyDayLead[]
  funnel: { status: LeadStatus; label: string; reached: number }[]
  closedLost: number
  closedJunk: number
  team: TeamRow[] | null
}

export async function getActionBoard(opts: { orgId: string; profileId: string | null; period: Period; includeTeam: boolean }): Promise<ActionBoard> {
  const { orgId, profileId, period } = opts
  const db = createServiceClient()
  const now = new Date()
  const { minutes, timezone } = await getResponseMinutes(orgId)
  const from = startOf(period, now, timezone)
  const dayStart = startOf('today', now, timezone)
  const dayEnd = new Date(dayStart.getTime() + 86_400_000)

  const scoped = <T extends { eq: (c: string, v: string) => T }>(q: T) => (profileId ? q.eq('assigned_to', profileId) : q)
  const count = (focus: Focus) =>
    applyFocus(scoped(db.from('leads').select('id', { count: 'exact', head: true }).eq('org_id', orgId)), focus, now)

  const [waiting, unassigned, overdue, noNext, visited, waitingRows, newLeads, visitsToday, cohort] = await Promise.all([
    count('waiting'), count('unassigned'), count('overdue'), count('no_next_step'), count('visited'),
    applyFocus(scoped(db.from('leads').select(LEAD_COLUMNS).eq('org_id', orgId)), 'waiting', now)
      .order('created_at', { ascending: true }).limit(6),
    scoped(db.from('leads').select('id', { count: 'exact', head: true }).eq('org_id', orgId)).gte('created_at', from.toISOString()),
    scoped(db.from('site_visits').select('id', { count: 'exact', head: true }).eq('org_id', orgId))
      .in('status', ['scheduled', 'rescheduled', 'checked_in']).gte('scheduled_at', dayStart.toISOString()).lt('scheduled_at', dayEnd.toISOString()),
    scoped(db.from('leads').select('status').eq('org_id', orgId)).gte('created_at', from.toISOString()).eq('is_duplicate', false).limit(10000),
  ])
  const failed = [waiting, unassigned, overdue, noNext, visited, waitingRows, newLeads, visitsToday, cohort].find((r) => r.error)
  if (failed?.error) throw new Error(`action board: ${failed.error.message}`)

  // Funnel for leads created in the period: how many reached each stage (current stage or beyond).
  const rank = new Map(FUNNEL.map((s, i) => [s.status, i]))
  const statuses = (cohort.data ?? []).map((r) => r.status as LeadStatus)
  const funnel = FUNNEL.map((s, i) => ({ ...s, reached: statuses.filter((st) => (rank.get(st) ?? -1) >= i).length }))
  funnel[0].reached = statuses.filter((st) => rank.has(st)).length

  return {
    period, responseMinutes: minutes, timezone,
    counts: {
      waiting: waiting.count ?? 0, unassigned: unassigned.count ?? 0, overdue: overdue.count ?? 0,
      no_next_step: noNext.count ?? 0, visited: visited.count ?? 0, newLeads: newLeads.count ?? 0, visitsToday: visitsToday.count ?? 0,
    },
    waitingLeads: (waitingRows.data ?? []) as unknown as MyDayLead[],
    funnel,
    closedLost: statuses.filter((s) => s === 'lost').length,
    closedJunk: statuses.filter((s) => s === 'junk').length,
    team: opts.includeTeam && !profileId ? await getTeamRows(orgId, now, from, dayStart, dayEnd) : null,
  }
}

async function getTeamRows(orgId: string, now: Date, from: Date, dayStart: Date, dayEnd: Date): Promise<TeamRow[]> {
  const db = createServiceClient()
  const [members, open, booked, visits] = await Promise.all([
    db.from('org_members').select('profile_id, role, profile:profiles!org_members_profile_id_fkey(full_name)')
      .eq('org_id', orgId).eq('status', 'active').in('role', ['owner', 'admin', 'manager', 'sales_exec']),
    db.from('leads').select('assigned_to, status, first_action_at, next_follow_up_at, created_at')
      .eq('org_id', orgId).not('assigned_to', 'is', null).not('status', 'in', `(${CLOSED_STATUSES.join(',')})`).limit(20000),
    db.from('leads').select('assigned_to').eq('org_id', orgId).eq('status', 'booked').gte('updated_at', from.toISOString()).limit(10000),
    db.from('site_visits').select('assigned_to').eq('org_id', orgId).in('status', ['scheduled', 'rescheduled', 'checked_in'])
      .gte('scheduled_at', dayStart.toISOString()).lt('scheduled_at', dayEnd.toISOString()).limit(10000),
  ])
  const failed = [members, open, booked, visits].find((r) => r.error)
  if (failed?.error) throw new Error(`action board team: ${failed.error.message}`)

  type M = { profile_id: string; role: string; profile: { full_name: string } | { full_name: string }[] | null }
  return ((members.data ?? []) as M[]).map((m) => {
    const mine = (open.data ?? []).filter((l) => l.assigned_to === m.profile_id)
    return {
      profileId: m.profile_id,
      name: (Array.isArray(m.profile) ? m.profile[0]?.full_name : m.profile?.full_name) ?? 'Unknown',
      role: m.role,
      open: mine.length,
      waiting: mine.filter((l) => !l.first_action_at).length,
      overdue: mine.filter((l) => l.next_follow_up_at && new Date(l.next_follow_up_at) < now).length,
      noNextStep: mine.filter((l) => IN_PROGRESS.includes(l.status as LeadStatus) && !l.next_follow_up_at).length,
      visitsToday: (visits.data ?? []).filter((v) => v.assigned_to === m.profile_id).length,
      bookings: (booked.data ?? []).filter((b) => b.assigned_to === m.profile_id).length,
    }
  }).sort((a, b) => b.waiting - a.waiting || b.overdue - a.overdue || b.open - a.open)
}
