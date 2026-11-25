// lib/calendar/rules.ts — the sales calendar (app/(dashboard)/[orgSlug]/calendar): views, the dates each view covers,
// colours, and whose calendar a person may open. Pure, so the page, the API and the tests share one definition.
//
// The calendar has no data of its own: it shows follow-ups (public.lead_tasks), which already include every live site
// visit (20260049 keeps one open task per visit). Reassigning a lead moves its open follow-ups to the new owner
// (move_open_tasks_with_lead), so a calendar is always the owner's real list — no copying, nothing to keep in sync.
import type { MemberRole } from '@/types/database'

export const VIEWS = { day: 'Day', week: 'Week', month: 'Month', agenda: 'Agenda' } as const
export type CalendarView = keyof typeof VIEWS

export const KINDS = {
  call: { label: 'Call', tone: 'brand' },
  whatsapp: { label: 'WhatsApp', tone: 'success' },
  meeting: { label: 'Meeting', tone: 'info' },
  site_visit: { label: 'Site visit', tone: 'warning' },
  other: { label: 'Other', tone: 'muted' },
} as const
export type TaskKind = keyof typeof KINDS

/** Semantic classes per kind (design tokens only). */
export const KIND_CLASS: Record<TaskKind, string> = {
  call: 'border-l-brand bg-brand-light text-foreground',
  whatsapp: 'border-l-success bg-success-bg text-foreground',
  meeting: 'border-l-info bg-info-bg text-foreground',
  site_visit: 'border-l-warning bg-warning-bg text-foreground',
  other: 'border-l-strong bg-surface-hover text-foreground',
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

export function parseView(v: unknown): CalendarView {
  return typeof v === 'string' && v in VIEWS ? (v as CalendarView) : 'week'
}

/** Today's date in a time zone, as YYYY-MM-DD. */
export function localDay(at: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(at)
}

export function parseDay(v: unknown, fallback: string): string {
  return typeof v === 'string' && DAY.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()) ? v : fallback
}

/** Calendar arithmetic on YYYY-MM-DD strings (UTC dates, so no time-zone drift). */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
export function weekday(day: string): number { return new Date(`${day}T00:00:00Z`).getUTCDay() } // 0 = Sunday

/** The days a view shows: a day; Monday–Sunday; the month's weeks (Monday first, 5–6 rows); agenda = 14 days. */
export function viewDays(view: CalendarView, anchor: string): string[] {
  if (view === 'day') return [anchor]
  if (view === 'agenda') return Array.from({ length: 14 }, (_, i) => addDays(anchor, i))
  if (view === 'week') {
    const monday = addDays(anchor, -((weekday(anchor) + 6) % 7))
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  }
  const first = `${anchor.slice(0, 8)}01`
  const start = addDays(first, -((weekday(first) + 6) % 7))
  const nextMonth = new Date(`${first}T00:00:00Z`); nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1)
  const last = addDays(nextMonth.toISOString().slice(0, 10), -1)
  const end = addDays(last, (7 - ((weekday(last) + 6) % 7) - 1))
  const days: string[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d)
  return days
}

/** Where "previous" and "next" go from a view. */
export function step(view: CalendarView, anchor: string, dir: -1 | 1): string {
  if (view === 'day') return addDays(anchor, dir)
  if (view === 'week') return addDays(anchor, 7 * dir)
  if (view === 'agenda') return addDays(anchor, 14 * dir)
  const d = new Date(`${anchor.slice(0, 8)}01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + dir)
  return d.toISOString().slice(0, 10)
}

/** The instant a local day starts in a time zone (e.g. 2026-11-25 in India → 2026-11-24T18:30Z). */
export function dayStart(day: string, tz: string): Date {
  const guess = new Date(`${day}T00:00:00Z`)
  const local = new Date(guess.toLocaleString('en-US', { timeZone: tz }))
  const utc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }))
  return new Date(guess.getTime() - (local.getTime() - utc.getTime()))
}

/**
 * Whose calendar a person may open: owners, admins and managers anyone's and the team view; a team lead their own
 * team's people; everyone else only their own.
 */
export function calendarScope(role: MemberRole | null | undefined): 'all' | 'team' | 'own' {
  if (role === 'owner' || role === 'admin' || role === 'manager') return 'all'
  if (role === 'team_lead') return 'team'
  return 'own'
}

export function canOpenCalendarOf(role: MemberRole | null | undefined, viewerId: string, teamIds: readonly string[], personId: string): boolean {
  const scope = calendarScope(role)
  if (scope === 'all') return true
  if (scope === 'team') return personId === viewerId || teamIds.includes(personId)
  return personId === viewerId
}

export interface CalendarItem {
  id: string
  leadId: string
  leadName: string
  leadStatus: string
  kind: TaskKind
  dueAt: string
  status: 'open' | 'done' | 'cancelled'
  note: string | null
  assigneeId: string | null
  assigneeName: string | null
  siteVisitId: string | null
}

export function isOverdue(item: Pick<CalendarItem, 'status' | 'dueAt'>, now: Date): boolean {
  return item.status === 'open' && new Date(item.dueAt).getTime() < now.getTime()
}

/** Groups items by their local day, each day sorted by time. */
export function byDay(items: CalendarItem[], tz: string): Map<string, CalendarItem[]> {
  const out = new Map<string, CalendarItem[]>()
  for (const it of [...items].sort((a, b) => a.dueAt.localeCompare(b.dueAt))) {
    const d = localDay(new Date(it.dueAt), tz)
    out.set(d, [...(out.get(d) ?? []), it])
  }
  return out
}

/** A team's load for the days shown: open items per person, how many are overdue, and the busiest day. */
export function workload(items: CalendarItem[], tz: string, now: Date): { assigneeId: string | null; name: string; open: number; overdue: number; done: number; busiestDay: string | null; busiest: number }[] {
  const people = new Map<string, CalendarItem[]>()
  for (const it of items) people.set(it.assigneeId ?? '', [...(people.get(it.assigneeId ?? '') ?? []), it])
  return [...people.entries()].map(([id, list]) => {
    const perDay = new Map<string, number>()
    for (const it of list.filter((x) => x.status === 'open')) { const d = localDay(new Date(it.dueAt), tz); perDay.set(d, (perDay.get(d) ?? 0) + 1) }
    const top = [...perDay.entries()].sort((a, b) => b[1] - a[1])[0]
    return {
      assigneeId: id || null, name: list[0].assigneeName ?? 'Nobody',
      open: list.filter((x) => x.status === 'open').length, overdue: list.filter((x) => isOverdue(x, now)).length,
      done: list.filter((x) => x.status === 'done').length, busiestDay: top?.[0] ?? null, busiest: top?.[1] ?? 0,
    }
  }).sort((a, b) => b.open - a.open || a.name.localeCompare(b.name))
}
