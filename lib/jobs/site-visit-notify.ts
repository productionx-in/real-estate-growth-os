// lib/jobs/site-visit-notify.ts
// site_visit.notify — tells the buyer about their site visit: confirmation when booked or moved, and reminders
// 24 h and 2 h before. Jobs are queued by the database (migration 20260049). A job whose visit has since been
// moved, cancelled or completed is skipped, so the buyer never receives a stale time.
// Channel today: email (when the lead has an address). WhatsApp follows once the WhatsApp Business connection
// and an approved template are in place.
import type { SupabaseClient } from '@supabase/supabase-js'
import { getEmailAdapter } from '@/lib/email/adapter'
import { renderEmail } from '@/lib/email/layout'
import type { JobRow } from '@/lib/jobs/handlers'

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
      footnote: `Sent by ${o.orgName} using REGrow.`,
    }),
  }
}

export async function siteVisitNotify(job: JobRow, db: Db): Promise<void> {
  const visitId = job.payload.visit_id
  if (typeof visitId !== 'string') throw new Error('site_visit.notify: missing visit_id')
  const { data: v, error } = await db.from('site_visits')
    .select('id, org_id, status, scheduled_at, meeting_link, lead:leads(name, email), project:projects(name, location, city), agent:profiles!site_visits_assigned_to_fkey(full_name, phone), org:organisations(name)')
    .eq('id', visitId).maybeSingle()
  if (error) throw new Error(`site_visit.notify: load failed: ${error.message}`)
  if (!v || !LIVE.includes(v.status)) return
  // Stale job: the visit was moved after this was queued.
  if (typeof job.payload.scheduled_at === 'string' && new Date(job.payload.scheduled_at).getTime() !== new Date(v.scheduled_at).getTime()) return

  const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? x[0] ?? null : x)
  const lead = one(v.lead as unknown as { name: string; email: string | null } | null)
  if (!lead?.email) return // nothing to send to; WhatsApp comes with the WhatsApp connection
  const project = one(v.project as unknown as { name: string; location: string | null; city: string | null } | null)
  const agent = one(v.agent as unknown as { full_name: string; phone: string | null } | null)
  const org = one(v.org as unknown as { name: string } | null)

  const kind = job.payload.kind === 'reminder' ? 'reminder' : job.payload.kind === 'rescheduled' ? 'rescheduled' : 'confirmation'
  const email = visitEmail({
    kind, minutesBefore: typeof job.payload.minutes_before === 'number' ? job.payload.minutes_before : undefined,
    buyer: lead.name, orgName: org?.name ?? 'Your developer', project: project?.name ?? 'the project',
    location: [project?.location, project?.city].filter(Boolean).join(', ') || null,
    when: new Date(v.scheduled_at), agentName: agent?.full_name ?? null, agentPhone: agent?.phone ?? null, meetingLink: v.meeting_link,
  })
  const sent = await getEmailAdapter().sendEmail({ to: lead.email, ...email })
  if (!sent.success) throw new Error(`site_visit.notify: email failed: ${sent.error}`)
}
