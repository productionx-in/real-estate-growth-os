// lib/dal/site-visits.ts
// Site visits: schedule, reschedule, check in (GPS), complete, no-show, cancel; and the calendar list.
// Tasks, lead stage, activity and buyer reminders follow automatically from the database (migration 20260049).
import { createServiceClient } from '@/lib/supabase/server'
import { getWorkspaceSettings } from '@/lib/dal/workspace-settings'

export const LIVE_STATUSES = ['scheduled', 'rescheduled', 'checked_in'] as const
export const OUTCOMES = {
  interested: 'Interested', follow_up_needed: 'Needs a follow-up', negotiation: 'Negotiating',
  booked: 'Booked', uninterested: 'Not interested',
} as const
export type VisitOutcome = keyof typeof OUTCOMES
/** Default for Settings → Site visits → check-in distance: a check-in further than this is accepted but flagged. */
export const CHECKIN_FLAG_METRES = 500

export type DalResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number }

/** Great-circle distance in metres. */
export function distanceMetres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))))
}

function dbError(message: string): { ok: false; error: string; status: number } {
  if (/site visit: cannot change/.test(message)) return { ok: false, error: message.replace(/^site visit: /, 'This visit ') , status: 409 }
  if (/tenant|organisation|same org/i.test(message)) return { ok: false, error: 'The lead, project and salesperson must all belong to this workspace.', status: 400 }
  if (/meeting_link/.test(message)) return { ok: false, error: 'The meeting link must start with https://', status: 400 }
  return { ok: false, error: 'Could not save the site visit.', status: 400 }
}

export interface VisitRow {
  id: string
  lead_id: string
  project_id: string
  assigned_to: string | null
  scheduled_at: string
  status: string
  outcome: string | null
  notes: string | null
  rating: number | null
  visitor_count: number
  accompanied_by: string | null
  meeting_link: string | null
  checkin_distance_m: number | null
  checked_in_at: string | null
  lead: { id: string; name: string; phone: string } | null
  project: { id: string; name: string } | null
  agent: { id: string; full_name: string } | null
}

const VISIT_COLUMNS = `id, lead_id, project_id, assigned_to, scheduled_at, status, outcome, notes, rating, visitor_count, accompanied_by,
  meeting_link, checkin_distance_m, checked_in_at,
  lead:leads!inner(id, name, phone), project:projects(id, name), agent:profiles!site_visits_assigned_to_fkey(id, full_name)`

export async function listVisits(orgId: string, opts: { from: Date; to: Date; profileId?: string | null; profileIds?: string[] | null; projectId?: string | null }): Promise<VisitRow[]> {
  const db = createServiceClient()
  let q = db.from('site_visits').select(VISIT_COLUMNS).eq('org_id', orgId)
    .gte('scheduled_at', opts.from.toISOString()).lt('scheduled_at', opts.to.toISOString())
    .order('scheduled_at', { ascending: true }).limit(1000)
  if (opts.profileId) q = q.eq('assigned_to', opts.profileId)
  else if (opts.profileIds) q = q.in('assigned_to', opts.profileIds)
  if (opts.projectId) q = q.eq('project_id', opts.projectId)
  const { data, error } = await q
  if (error) throw new Error(`site visits: ${error.message}`)
  return (data ?? []) as unknown as VisitRow[]
}

export async function getVisit(id: string): Promise<{ id: string; org_id: string; lead_id: string; project_id: string; status: string } | null> {
  const db = createServiceClient()
  const { data } = await db.from('site_visits').select('id, org_id, lead_id, project_id, status').eq('id', id).maybeSingle()
  return data ?? null
}

export async function scheduleVisit(input: {
  orgId: string; leadId: string; projectId: string; assignedTo: string | null; scheduledAt: Date; actorId: string
  visitorCount?: number; accompaniedBy?: string | null; meetingLink?: string | null; notes?: string | null
}): Promise<DalResult<{ id: string }>> {
  if (input.scheduledAt.getTime() < Date.now() - 5 * 60_000) return { ok: false, error: 'Pick a time in the future.', status: 400 }
  const db = createServiceClient()
  const full = await overDailyLimit(input.orgId, input.assignedTo, input.scheduledAt)
  if (full) return { ok: false, error: full, status: 409 }
  const { data, error } = await db.from('site_visits').insert({
    org_id: input.orgId, lead_id: input.leadId, project_id: input.projectId, assigned_to: input.assignedTo,
    scheduled_at: input.scheduledAt.toISOString(), status: 'scheduled', created_by: input.actorId,
    visitor_count: input.visitorCount ?? 1, accompanied_by: input.accompaniedBy || null,
    meeting_link: input.meetingLink || null, notes: input.notes || null,
  }).select('id').single()
  if (error) return dbError(error.message)
  return { ok: true, data: { id: data.id } }
}

/** The workspace's daily limit (Settings → Site visits): a message when the salesperson's day is full, else null. */
export async function overDailyLimit(orgId: string, assignedTo: string | null, at: Date, ignoreVisitId?: string): Promise<string | null> {
  if (!assignedTo) return null
  const max = (await getWorkspaceSettings(orgId)).visits.maxPerPersonPerDay
  if (!max) return null
  const IST = 330 * 60_000, DAY = 86_400_000
  const start = Math.floor((at.getTime() + IST) / DAY) * DAY - IST
  let q = createServiceClient().from('site_visits').select('id', { count: 'exact', head: true })
    .eq('org_id', orgId).eq('assigned_to', assignedTo).in('status', [...LIVE_STATUSES, 'completed'])
    .gte('scheduled_at', new Date(start).toISOString()).lt('scheduled_at', new Date(start + DAY).toISOString())
  if (ignoreVisitId) q = q.neq('id', ignoreVisitId)
  const { count } = await q
  return (count ?? 0) >= max
    ? `This salesperson already has ${count} site visit${count === 1 ? '' : 's'} that day — the workspace limit is ${max}. Pick another day or another person.`
    : null
}

export type VisitAction =
  | { action: 'reschedule'; scheduledAt: Date }
  | { action: 'check_in'; lat: number | null; lng: number | null }
  | { action: 'complete'; outcome: VisitOutcome; rating?: number | null; notes?: string | null }
  | { action: 'no_show' }
  | { action: 'cancel'; reason?: string | null }

export async function actOnVisit(visitId: string, orgId: string, actorId: string, act: VisitAction): Promise<DalResult<{ status: string; checkinDistanceM?: number | null }>> {
  const db = createServiceClient()
  let patch: Record<string, unknown>
  switch (act.action) {
    case 'reschedule': {
      if (act.scheduledAt.getTime() < Date.now() - 5 * 60_000) return { ok: false, error: 'Pick a time in the future.', status: 400 }
      const { data: cur } = await db.from('site_visits').select('assigned_to').eq('id', visitId).eq('org_id', orgId).maybeSingle()
      const full = await overDailyLimit(orgId, cur?.assigned_to ?? null, act.scheduledAt, visitId)
      if (full) return { ok: false, error: full, status: 409 }
      patch = { status: 'rescheduled', scheduled_at: act.scheduledAt.toISOString() }
      break
    }
    case 'check_in': {
      let distance: number | null = null
      if (act.lat !== null && act.lng !== null) {
        const { data: v } = await db.from('site_visits').select('project:projects(latitude, longitude)').eq('id', visitId).eq('org_id', orgId).maybeSingle()
        const p = (Array.isArray(v?.project) ? v?.project[0] : v?.project) as { latitude: number | null; longitude: number | null } | null | undefined
        if (p?.latitude != null && p?.longitude != null) distance = distanceMetres({ lat: act.lat, lng: act.lng }, { lat: p.latitude, lng: p.longitude })
      }
      patch = { status: 'checked_in', checkin_lat: act.lat, checkin_lng: act.lng, checkin_distance_m: distance }
      break
    }
    case 'complete':
      patch = { status: 'completed', outcome: act.outcome, rating: act.rating ?? null, ...(act.notes ? { notes: act.notes } : {}) }
      break
    case 'no_show':
      patch = { status: 'no_show' }
      break
    case 'cancel':
      patch = { status: 'cancelled', cancel_reason: act.reason || null }
      break
  }
  const { data, error } = await db.from('site_visits').update({ ...patch, updated_by: actorId })
    .eq('id', visitId).eq('org_id', orgId).select('status, checkin_distance_m').maybeSingle()
  if (error) return dbError(error.message)
  if (!data) return { ok: false, error: 'Site visit not found.', status: 404 }
  return { ok: true, data: { status: data.status, checkinDistanceM: data.checkin_distance_m } }
}
