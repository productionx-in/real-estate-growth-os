// lib/jobs/site-visit-notify.ts
// site_visit.notify — tells the buyer about their site visit: confirmation when booked or moved, and reminders
// 24 h and 2 h before. Jobs are queued by the database (migration 20260049). A job whose visit has since been
// moved, cancelled or completed is skipped, so the buyer never receives a stale time.
// Channel today: email (when the lead has an address). WhatsApp follows once the WhatsApp Business connection
// and an approved template are in place.
import type { SupabaseClient } from '@supabase/supabase-js'
import { renderEmail } from '@/lib/email/layout'
import type { JobRow } from '@/lib/jobs/handlers'
import { settingsFromRow, type VisitSettings } from '@/lib/settings/workspace'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, 'public', any>

const LIVE = ['scheduled', 'rescheduled']

export function visitEmail(o: {
  kind: 'confirmation' | 'rescheduled' | 'reminder'; minutesBefore?: number; buyer: string; orgName: string; project: string
  location: string | null; when: Date; agentName: string | null; agentPhone: string | null; meetingLink: string | null
}) {
  const time = new Intl.DateTimeFormat('en-IN', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(o.when)
  const first = o.buyer.trim().split(/\s+/)[0] || 'there'
  const heading = o.kind === 'reminder'
    ? (o.minutesBefore && o.minutesBefore <= 180 ? `Your visit to ${o.project} is soon` : `Your visit to ${o.project} is tomorrow`)
    : o.kind === 'rescheduled' ? `Your visit to ${o.project} has moved` : `Your visit to ${o.project} is booked`
  const subject = o.kind === 'reminder' ? `Reminder: site visit at ${o.project}, ${time}` : `${heading} — ${time}`
  const paragraphs = [
    `Hi ${first},`,
    o.kind === 'rescheduled' ? `Your site visit has a new time: **${time}**.` : `Your site visit is on **${time}**.`,
    `**Project:** ${o.project}${o.location ? `, ${o.location}` : ''}`,
    ...(o.agentName ? [`**You'll meet:** ${o.agentName}${o.agentPhone ? ` (${o.agentPhone})` : ''}`] : []),
    `Need to change the time? Reply to this email or call ${o.agentName ? o.agentName.split(' ')[0] : 'us'}.`,
  ]
  return {
    subject,
    ...renderEmail({
      preheader: `${o.project} · ${time}`,
      heading,
      paragraphs,
      cta: o.meetingLink ? { label: 'Join the online meeting', url: o.meetingLink } : undefined,
      footnote: `Sent by ${o.orgName} using RE by PX.`,
    }),
  }
}

type VisitRow = { id: string; org_id: string; status: string; scheduled_at: string; meeting_link: string | null; lead: unknown; project: unknown; agent: unknown; org: unknown }
const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? x[0] ?? null : x)

/** Loads the visit FOR THIS ORGANISATION only; null when it no longer exists there. */
async function loadVisit(db: Db, visitId: string, orgId: string | null): Promise<VisitRow | null> {
  let q = db.from('site_visits')
    .select('id, org_id, status, scheduled_at, meeting_link, lead:leads(name, email), project:projects(name, location, city), agent:profiles!site_visits_assigned_to_fkey(full_name, phone), org:organisations(name)')
    .eq('id', visitId)
  if (orgId) q = q.eq('org_id', orgId)
  const { data, error } = await q.maybeSingle()
  if (error) throw new Error(`site visit load failed: ${error.message}`)
  return (data as VisitRow | null) ?? null
}

/** Why this message should not go out any more, or null when it still should. */
function staleReason(v: VisitRow | null, payload: Record<string, unknown>): string | null {
  if (!v) return 'visit not found in this organisation'
  if (!LIVE.includes(v.status)) return `visit is ${v.status}`
  if (typeof payload.scheduled_at === 'string' && new Date(payload.scheduled_at).getTime() !== new Date(v.scheduled_at).getTime()) return 'visit was moved'
  return null
}

/** The 'site_visit' outbox template: re-checked at delivery, so a moved or cancelled visit is never announced. */
export async function renderSiteVisit(db: Db, orgId: string | null, payload: Record<string, unknown>) {
  if (!orgId) return { skip: 'site visit e-mail without an organisation' }
  const v = await loadVisit(db, String(payload.visit_id ?? ''), orgId)
  const stale = staleReason(v, payload)
  if (stale) return { skip: stale }
  const lead = one(v!.lead as { name: string; email: string | null } | null)
  const project = one(v!.project as { name: string; location: string | null; city: string | null } | null)
  const agent = one(v!.agent as { full_name: string; phone: string | null } | null)
  const org = one(v!.org as { name: string } | null)
  const kind = payload.kind === 'reminder' ? 'reminder' : payload.kind === 'rescheduled' ? 'rescheduled' : 'confirmation'
  return visitEmail({
    kind, minutesBefore: typeof payload.minutes_before === 'number' ? payload.minutes_before : undefined,
    buyer: lead?.name ?? '', orgName: org?.name ?? 'Your developer', project: project?.name ?? 'the project',
    location: [project?.location, project?.city].filter(Boolean).join(', ') || null,
    when: new Date(v!.scheduled_at), agentName: agent?.full_name ?? null, agentPhone: agent?.phone ?? null, meetingLink: v!.meeting_link,
  })
}

async function visitSettings(db: Db, orgId: string): Promise<VisitSettings> {
  const { data } = await db.from('org_settings').select('visits').eq('org_id', orgId).maybeSingle()
  return settingsFromRow({ visits: data?.visits }).visits
}

/** Whether this kind of buyer message is switched on for the workspace. */
export function buyerMessageWanted(s: VisitSettings, payload: Record<string, unknown>): boolean {
  if (payload.kind === 'reminder') return Number(payload.minutes_before) >= 720 ? s.buyerReminder24h : s.buyerReminder2h
  return s.buyerConfirmation
}

/** The site_visit.notify job (queued by the database with the visit, migration 20260049): puts the buyer's e-mail in
 *  the outbox and makes the first attempt. Retries, holds and logging are the outbox's job from here. */
export async function siteVisitNotify(job: JobRow, db: Db): Promise<void> {
  const visitId = job.payload.visit_id
  if (typeof visitId !== 'string') throw new Error('site_visit.notify: missing visit_id')
  const v = await loadVisit(db, visitId, job.org_id)
  if (staleReason(v, job.payload)) return
  // The workspace may have turned some buyer messages off (Settings → Site visits).
  if (!buyerMessageWanted(await visitSettings(db, v!.org_id), job.payload)) return
  const lead = one(v!.lead as { name: string; email: string | null } | null)
  if (!lead?.email) return // nothing to send to; WhatsApp comes with the WhatsApp connection
  const { sendEmailNow } = await import('@/lib/email/service')
  const key = ['site_visit', visitId, String(job.payload.kind ?? 'confirmation'), String(job.payload.minutes_before ?? 0), String(job.payload.scheduled_at ?? v!.scheduled_at)].join(':')
  await sendEmailNow(db, {
    orgId: v!.org_id, category: 'buyer', template: 'site_visit', to: lead.email, idempotencyKey: key,
    payload: { visit_id: visitId, kind: job.payload.kind ?? 'confirmation', minutes_before: job.payload.minutes_before ?? null, scheduled_at: job.payload.scheduled_at ?? v!.scheduled_at },
  })
}
