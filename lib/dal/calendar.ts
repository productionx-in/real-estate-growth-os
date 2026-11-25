// lib/dal/calendar.ts — the sales calendar's reads (rules in lib/calendar/rules.ts). Follow-ups for the people the
// caller may see, in the days shown, plus anything still open from before (overdue). Scoped by organisation; the page
// has already checked whose calendar the caller may open.
import { createServiceClient } from '@/lib/supabase/server'
import { dayStart, type CalendarItem, type TaskKind } from '@/lib/calendar/rules'

interface Row {
  id: string; lead_id: string; kind: TaskKind; due_at: string; status: CalendarItem['status']; note: string | null
  assigned_to: string | null; site_visit_id: string | null
  lead: { name: string; status: string; deleted_at?: string | null } | null
  assignee: { full_name: string | null } | null
}

const SELECT = 'id, lead_id, kind, due_at, status, note, assigned_to, site_visit_id, lead:leads_all!inner(name, status, deleted_at), assignee:profiles!lead_tasks_assigned_to_fkey(full_name)'

const shape = (r: Row): CalendarItem => ({
  id: r.id, leadId: r.lead_id, leadName: r.lead?.name ?? 'Lead', leadStatus: r.lead?.status ?? 'new', kind: r.kind, dueAt: r.due_at,
  status: r.status, note: r.note, assigneeId: r.assigned_to, assigneeName: r.assignee?.full_name?.trim() || null, siteVisitId: r.site_visit_id,
})

/**
 * Follow-ups between the first and last day shown (in the workspace's time zone) for these people — or everyone in the
 * workspace when `people` is null (the team view) — plus every follow-up still open from before, so nothing overdue
 * hides off-screen. Cancelled follow-ups are left out.
 */
export async function calendarItems(orgId: string, days: string[], tz: string, people: string[] | null, now = new Date()): Promise<{ items: CalendarItem[]; overdue: CalendarItem[] }> {
  const db = createServiceClient()
  const from = dayStart(days[0], tz)
  const end = dayStart(nextDay(days[days.length - 1]), tz)
  // Archived leads (deleted_at set) drop off the calendar with their follow-ups.
  let q = db.from('lead_tasks').select(SELECT).eq('org_id', orgId).neq('status', 'cancelled').is('lead.deleted_at', null)
    .gte('due_at', from.toISOString()).lt('due_at', end.toISOString()).order('due_at').limit(2000)
  let o = db.from('lead_tasks').select(SELECT).eq('org_id', orgId).eq('status', 'open').is('lead.deleted_at', null)
    .lt('due_at', (from < now ? from : now).toISOString()).order('due_at').limit(200)
  if (people) { q = q.in('assigned_to', people); o = o.in('assigned_to', people) }
  const [{ data: inRange }, { data: late }] = await Promise.all([q, o])
  return { items: ((inRange ?? []) as unknown as Row[]).map(shape), overdue: ((late ?? []) as unknown as Row[]).map(shape) }
}

function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10)
}

/** Everyone whose calendar can be shown in this workspace (people who can be given follow-ups), for the picker. */
export async function calendarPeople(orgId: string, only: string[] | null): Promise<{ id: string; name: string }[]> {
  let q = createServiceClient().from('org_members').select('profile_id, profiles!org_members_profile_id_fkey(full_name)')
    .eq('org_id', orgId).eq('status', 'active').in('role', ['owner', 'admin', 'manager', 'team_lead', 'sales_exec', 'post_sales'])
  if (only) q = q.in('profile_id', only)
  const { data } = await q
  return ((data ?? []) as unknown as { profile_id: string; profiles: { full_name: string | null } | null }[])
    .map((m) => ({ id: m.profile_id, name: m.profiles?.full_name?.trim() || 'Team member' }))
    .sort((a, b) => a.name.localeCompare(b.name))
}
