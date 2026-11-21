// lib/jobs/daily-reports.ts — email.daily_reports (08:01 IST daily, migration 20260069).
// For every active workspace: "Your day" to each person with work waiting, and "Your team's day" to owners,
// admins and managers. Days are Indian Standard Time. Once per person per day (customer_email_log), only to
// people whose profile has email_daily_report on, never to read-only members, deactivated or erased accounts.
// The numbers come from computeDay(), a pure function, so they are tested exactly (tests/daily-report.test.mjs).
import type { SupabaseClient } from '@supabase/supabase-js'
import { deliverOne } from '@/lib/email/service'
import { quietDay, type PersonDay, type TeamDay } from '@/lib/email/daily-report'
import { emailOf } from '@/lib/jobs/customer-emails'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, 'public', any>
const IST_OFFSET_MS = 330 * 60_000
const DAY = 86_400_000
const CLOSED = ['booked', 'lost', 'junk']
const MANAGERS = ['owner', 'admin', 'manager']
const NO_REPORT = ['readonly']

/** Start of "today" in IST, as a UTC instant, plus yesterday's start and tomorrow's start. */
export function istDay(now = Date.now()) {
  const ist = now + IST_OFFSET_MS
  const todayStart = Math.floor(ist / DAY) * DAY - IST_OFFSET_MS
  return { yesterday: todayStart - DAY, today: todayStart, tomorrow: todayStart + DAY }
}

export interface DayRows {
  members: { profileId: string; name: string; role: string }[]
  leads: { id: string; name: string; assigned_to: string | null; status: string; created_at: string; received_at: string | null; assigned_at: string | null; first_action_at: string | null; source: string | null }[]
  tasks: { assigned_to: string | null; due_at: string; status: string }[]
  visits: { assigned_to: string | null; scheduled_at: string; status: string; completed_at: string | null }[]
  bookings: { created_at: string; total_amount: number | null; status: string | null }[]
}

const t = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN)
const median = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Everyone's day and the team's day, from rows already scoped to one workspace. */
export function computeDay(rows: DayRows, now = Date.now()): { team: TeamDay; people: Map<string, PersonDay> } {
  const { yesterday, today, tomorrow } = istDay(now)
  const inYesterday = (iso: string | null | undefined) => t(iso) >= yesterday && t(iso) < today
  const inToday = (iso: string | null | undefined) => t(iso) >= today && t(iso) < tomorrow
  const open = rows.leads.filter((l) => !CLOSED.includes(l.status))
  const arrived = (l: DayRows['leads'][number]) => l.received_at ?? l.created_at
  const yLeads = rows.leads.filter((l) => inYesterday(arrived(l)))

  const people = new Map<string, PersonDay>()
  for (const m of rows.members) {
    const mine = open.filter((l) => l.assigned_to === m.profileId)
    const waiting = mine.filter((l) => !l.first_action_at).sort((a, b) => t(arrived(a)) - t(arrived(b)))
    const myTasks = rows.tasks.filter((x) => x.assigned_to === m.profileId && x.status === 'open')
    people.set(m.profileId, {
      name: m.name,
      newAssigned: rows.leads.filter((l) => l.assigned_to === m.profileId && inYesterday(l.assigned_at ?? arrived(l))).length,
      waitingFirstCall: waiting.length,
      followUpsToday: myTasks.filter((x) => inToday(x.due_at)).length,
      followUpsOverdue: myTasks.filter((x) => t(x.due_at) < today).length,
      visitsToday: rows.visits.filter((v) => v.assigned_to === m.profileId && ['scheduled', 'rescheduled'].includes(v.status) && inToday(v.scheduled_at)).length,
      callFirst: waiting.slice(0, 5).map((l) => l.name),
    })
  }

  const sources = new Map<string, number>()
  for (const l of yLeads) sources.set(l.source ?? 'other', (sources.get(l.source ?? 'other') ?? 0) + 1)
  const answered = yLeads.filter((l) => l.first_action_at).map((l) => (t(l.first_action_at) - t(arrived(l))) / 60_000).filter((m) => m >= 0)
  const yBookings = rows.bookings.filter((b) => inYesterday(b.created_at) && b.status !== 'cancelled')
  const team: TeamDay = {
    newLeads: yLeads.length,
    bySource: [...sources.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s, n]) => [s.replace(/_/g, ' '), n]),
    answeredMedianMinutes: median(answered),
    notYetAnswered: yLeads.filter((l) => !l.first_action_at && !CLOSED.includes(l.status)).length,
    unassigned: open.filter((l) => !l.assigned_to).length,
    followUpsOverdue: rows.tasks.filter((x) => x.status === 'open' && t(x.due_at) < today).length,
    visitsYesterday: {
      done: rows.visits.filter((v) => v.status === 'completed' && inYesterday(v.completed_at ?? v.scheduled_at)).length,
      noShow: rows.visits.filter((v) => v.status === 'no_show' && inYesterday(v.scheduled_at)).length,
    },
    visitsToday: rows.visits.filter((v) => ['scheduled', 'rescheduled'].includes(v.status) && inToday(v.scheduled_at)).length,
    bookingsYesterday: yBookings.length,
    bookingValueYesterday: yBookings.reduce((s, b) => s + Number(b.total_amount ?? 0), 0),
    people: [...people.values()].sort((a, b) => (b.waitingFirstCall + b.followUpsOverdue + b.newAssigned) - (a.waitingFirstCall + a.followUpsOverdue + a.newAssigned)),
  }
  return { team, people }
}

async function loadRows(db: Db, orgId: string, now: number): Promise<DayRows> {
  const { yesterday, tomorrow } = istDay(now)
  const since = new Date(yesterday).toISOString()
  const { data: ms } = await db.from('org_members').select('profile_id, role').eq('org_id', orgId).eq('status', 'active')
  const members: DayRows['members'] = []
  for (const m of ms ?? []) {
    if (NO_REPORT.includes(m.role)) continue
    const { data: p } = await db.from('profiles').select('full_name').eq('id', m.profile_id).maybeSingle()
    members.push({ profileId: m.profile_id, name: p?.full_name || 'Team member', role: m.role })
  }
  const cols = 'id, name, assigned_to, status, created_at, received_at, assigned_at, first_action_at, source'
  const [{ data: openLeads }, { data: recent }, { data: tasks }, { data: visits }, { data: bookings }] = await Promise.all([
    db.from('leads').select(cols).eq('org_id', orgId).is('merged_into_id', null).not('status', 'in', `(${CLOSED.join(',')})`).limit(5000),
    db.from('leads').select(cols).eq('org_id', orgId).is('merged_into_id', null).gte('created_at', since).limit(5000),
    db.from('lead_tasks').select('assigned_to, due_at, status').eq('org_id', orgId).eq('status', 'open').lt('due_at', new Date(tomorrow).toISOString()).limit(5000),
    db.from('site_visits').select('assigned_to, scheduled_at, status, completed_at').eq('org_id', orgId).gte('scheduled_at', since).lt('scheduled_at', new Date(tomorrow).toISOString()),
    db.from('bookings').select('created_at, total_amount, status').eq('org_id', orgId).gte('created_at', since),
  ])
  const byId = new Map<string, DayRows['leads'][number]>()
  for (const l of [...(openLeads ?? []), ...(recent ?? [])]) byId.set(l.id, l)
  return { members, leads: [...byId.values()], tasks: tasks ?? [], visits: visits ?? [], bookings: bookings ?? [] }
}

export async function dailyReports(_job: unknown, db: Db, now = Date.now()): Promise<void> {
  const { today } = istDay(now)
  const dateKey = new Date(today + IST_OFFSET_MS).toISOString().slice(0, 10)
  const dateLabel = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' }).format(new Date(now))

  const { data: orgs } = await db.from('organisations').select('id, name, slug, lifecycle_state').in('lifecycle_state', ['active', 'grace', 'pending_setup'])
  for (const org of orgs ?? []) {
    const rows = await loadRows(db, org.id, now)
    if (!rows.members.length) continue
    const { team, people } = computeDay(rows, now)
    for (const m of rows.members) {
      const { data: pref } = await db.from('profiles').select('email_daily_report').eq('id', m.profileId).maybeSingle()
      if (pref && pref.email_daily_report === false) continue
      const manager = MANAGERS.includes(m.role)
      const own = people.get(m.profileId) ?? null
      if (!manager && (!own || quietDay(own))) continue // nothing to say today
      const kind = manager ? 'daily_manager' : 'daily_member'
      const key = `daily:${org.id}:${m.profileId}:${dateKey}`
      const to = await emailOf(db, m.profileId)
      const firstName = m.name.trim().split(/\s+/)[0] || 'there'
      const args = manager
        ? { orgName: org.name, firstName, dateLabel, team, own, urlPath: `/${org.slug}` }
        : { orgName: org.name, firstName, dateLabel, day: own, urlPath: `/${org.slug}/today` }
      // Log row + outbox row in one transaction; a second run the same day is a no-op.
      const { data: ids, error } = await db.rpc('enqueue_customer_email', {
        p_org: org.id, p_kind: kind, p_event_key: key, p_recipients: to, p_template: manager ? 'daily.manager' : 'daily.member', p_payload: { args },
      } as never)
      if (error) { console.error('[daily-reports] could not queue', error.message); continue }
      for (const id of (ids as string[] | null) ?? []) await deliverOne(db, id)
    }
  }
}
