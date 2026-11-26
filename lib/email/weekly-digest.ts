// lib/email/weekly-digest.ts — the Monday e-mail to owners, admins and managers: last week in numbers, compared
// with the week before, why leads were lost, and who did what. Numbers and lead counts only (no buyer names or
// contact details). computeWeek() is pure so the numbers are tested exactly (tests/weekly-digest.test.mjs).
import { renderEmail } from '@/lib/email/layout'

const IST = 330 * 60_000
const DAY = 86_400_000
const CLOSED = ['booked', 'lost', 'junk']

/** The 7 full India-time days before today (Monday 00:00 → Monday 00:00 when run on a Monday) and the 7 before. */
export function weekWindow(now = Date.now()) {
  const todayStart = Math.floor((now + IST) / DAY) * DAY - IST
  return { prevStart: todayStart - 14 * DAY, start: todayStart - 7 * DAY, end: todayStart }
}

export interface WeekRows {
  members: { profileId: string; name: string }[]
  /** Leads that arrived in the last 14 days. */
  leads: { assigned_to: string | null; status: string; source: string | null; created_at: string; received_at: string | null; first_action_at: string | null }[]
  /** Leads closed as Lost or Junk during the week (from their timeline). */
  closed: { to: string; reason: string | null }[]
  visits: { assigned_to: string | null; scheduled_at: string; status: string; completed_at: string | null }[]
  bookings: { created_at: string; total_amount: number | null; status: string | null }[]
}

export interface PersonWeek { name: string; newAssigned: number; answered: number; visitsDone: number }
export interface Week {
  newLeads: number
  prevNewLeads: number
  bySource: Array<[string, number]>
  answeredMedianMinutes: number | null
  notAnswered: number
  visitsDone: number
  noShows: number
  bookings: number
  bookingValue: number
  lost: number
  junk: number
  topReasons: Array<[string, number]>
  people: PersonWeek[]
}

const t = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN)
const median = (xs: number[]) => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const top = (m: Map<string, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n)

export function computeWeek(rows: WeekRows, now = Date.now()): Week {
  const { prevStart, start, end } = weekWindow(now)
  const arrived = (l: WeekRows['leads'][number]) => t(l.received_at ?? l.created_at)
  const inWeek = (ms: number) => ms >= start && ms < end
  const week = rows.leads.filter((l) => inWeek(arrived(l)))
  const prev = rows.leads.filter((l) => arrived(l) >= prevStart && arrived(l) < start)
  const sources = new Map<string, number>()
  for (const l of week) { const s = (l.source ?? 'other').replace(/_/g, ' '); sources.set(s, (sources.get(s) ?? 0) + 1) }
  const answered = week.filter((l) => l.first_action_at).map((l) => (t(l.first_action_at) - arrived(l)) / 60_000).filter((m) => m >= 0)
  const reasons = new Map<string, number>()
  for (const c of rows.closed) if (c.to === 'lost' && c.reason) reasons.set(c.reason, (reasons.get(c.reason) ?? 0) + 1)
  const done = rows.visits.filter((v) => v.status === 'completed' && inWeek(t(v.completed_at ?? v.scheduled_at)))
  const books = rows.bookings.filter((b) => inWeek(t(b.created_at)) && b.status !== 'cancelled')
  const people = rows.members.map((m) => ({
    name: m.name,
    newAssigned: week.filter((l) => l.assigned_to === m.profileId).length,
    answered: week.filter((l) => l.assigned_to === m.profileId && l.first_action_at).length,
    visitsDone: done.filter((v) => v.assigned_to === m.profileId).length,
  })).filter((p) => p.newAssigned || p.visitsDone).sort((a, b) => b.newAssigned + b.visitsDone - (a.newAssigned + a.visitsDone) || a.name.localeCompare(b.name))
  return {
    newLeads: week.length,
    prevNewLeads: prev.length,
    bySource: top(sources, 5),
    answeredMedianMinutes: median(answered),
    notAnswered: week.filter((l) => !l.first_action_at && !CLOSED.includes(l.status)).length,
    visitsDone: done.length,
    noShows: rows.visits.filter((v) => v.status === 'no_show' && inWeek(t(v.scheduled_at))).length,
    bookings: books.length,
    bookingValue: books.reduce((s, b) => s + Number(b.total_amount ?? 0), 0),
    lost: rows.closed.filter((c) => c.to === 'lost').length,
    junk: rows.closed.filter((c) => c.to === 'junk').length,
    topReasons: top(reasons, 5),
    people,
  }
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const inr = (rupees: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(rupees)
const mins = (m: number) => (m < 60 ? `${Math.round(m)} min` : m < 1440 ? `${Math.round(m / 6) / 10} h` : `${Math.round(m / 144) / 10} days`)

/** "↑ 12% on the week before", "same as the week before", or nothing when there is no earlier week to compare. */
export function trend(now: number, before: number): string {
  if (!before) return ''
  if (now === before) return ' (same as the week before)'
  const pct = Math.round(((now - before) / before) * 100)
  return ` (${pct > 0 ? '↑' : '↓'} ${Math.abs(pct)}% on the week before)`
}

export function weeklyDigestEmail(o: { orgName: string; firstName: string; rangeLabel: string; week: Week; url: string }) {
  const w = o.week
  const quiet = !w.newLeads && !w.bookings && !w.visitsDone && !w.lost
  return {
    subject: `${o.orgName} last week: ${plural(w.newLeads, 'new lead')}${w.bookings ? `, ${plural(w.bookings, 'booking')}` : ''}`,
    ...renderEmail({
      preheader: quiet ? 'A quiet week.' : `${w.newLeads} new leads${trend(w.newLeads, w.prevNewLeads)}, ${w.bookings} bookings, ${w.visitsDone} site visits.`,
      heading: `Your week at ${o.orgName}, ${o.firstName}`,
      paragraphs: [
        `${o.rangeLabel}.`,
        '**Leads**',
        `• **${w.newLeads}** new${trend(w.newLeads, w.prevNewLeads)}${w.bySource.length ? ` — ${w.bySource.map(([s, n]) => `${s} ${n}`).join(', ')}` : ''}`,
        `• First answer: ${w.answeredMedianMinutes === null ? 'no answered leads' : `half were answered within **${mins(w.answeredMedianMinutes)}**`}${w.notAnswered ? `; **${w.notAnswered}** still not answered` : ''}`,
        '**Sales**',
        `• Site visits: **${w.visitsDone}** done${w.noShows ? `, ${w.noShows} no-show` : ''}`,
        `• Bookings: **${w.bookings}**${w.bookings ? ` worth ${inr(w.bookingValue)}` : ''}`,
        `• Closed: **${w.lost}** lost, **${w.junk}** junk`,
        ...(w.topReasons.length ? ['**Why leads were lost**', ...w.topReasons.map(([r, n]) => `• ${r}: ${n}`)] : []),
        ...(w.people.length ? ['**By person** (new leads · answered · site visits done)', ...w.people.slice(0, 15).map((p) => `• ${p.name}: ${p.newAssigned} · ${p.answered} · ${p.visitsDone}`)] : []),
      ],
      cta: { label: 'Open reports', url: o.url },
      reason: 'You get this each Monday as an owner, admin or manager of a RE by PX workspace. Turn it off in Settings → My notifications.',
    }),
  }
}
