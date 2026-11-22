// lib/jobs/weekly-digest.ts — email.weekly_digest (Monday 08:13 IST, migration 20260076). For every active
// workspace, last week's digest to each owner, admin and manager whose profile has email_weekly_digest on. Once per
// person per week (customer_email_log), through the e-mail outbox like the daily report.
import type { SupabaseClient } from '@supabase/supabase-js'
import { deliverOne } from '@/lib/email/service'
import { emailOf } from '@/lib/jobs/customer-emails'
import { computeWeek, weekWindow, type WeekRows } from '@/lib/email/weekly-digest'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, 'public', any>
const MANAGERS = ['owner', 'admin', 'manager']

async function loadRows(db: Db, orgId: string, now: number): Promise<{ rows: WeekRows; managers: { profileId: string; name: string }[] }> {
  const { prevStart, start, end } = weekWindow(now)
  const iso = (ms: number) => new Date(ms).toISOString()
  const { data: ms } = await db.from('org_members').select('profile_id, role, profile:profiles!org_members_profile_id_fkey(full_name)').eq('org_id', orgId).eq('status', 'active')
  const members = (ms ?? []).filter((m) => m.role !== 'readonly').map((m) => ({ profileId: m.profile_id as string, name: ((m.profile as { full_name?: string } | null)?.full_name || 'Team member') as string, role: m.role as string }))
  const [{ data: leads }, { data: acts }, { data: visits }, { data: bookings }] = await Promise.all([
    db.from('leads').select('assigned_to, status, source, created_at, received_at, first_action_at').eq('org_id', orgId).is('merged_into_id', null).gte('created_at', iso(prevStart)).lt('created_at', iso(end)).limit(20000),
    db.from('lead_activities').select('metadata, lead:leads!inner(org_id)').eq('type', 'status_changed').eq('lead.org_id', orgId).gte('created_at', iso(start)).lt('created_at', iso(end)).limit(20000),
    db.from('site_visits').select('assigned_to, scheduled_at, status, completed_at').eq('org_id', orgId).gte('scheduled_at', iso(start - 7 * 86_400_000)).lt('scheduled_at', iso(end)),
    db.from('bookings').select('created_at, total_amount, status').eq('org_id', orgId).gte('created_at', iso(start)).lt('created_at', iso(end)),
  ])
  const closed = (acts ?? []).map((a) => a.metadata as { to?: string; reason?: string } | null)
    .filter((m): m is { to: string; reason?: string } => !!m && (m.to === 'lost' || m.to === 'junk'))
    .map((m) => ({ to: m.to, reason: typeof m.reason === 'string' ? m.reason : null }))
  return {
    rows: { members, leads: leads ?? [], closed, visits: visits ?? [], bookings: bookings ?? [] },
    managers: members.filter((m) => MANAGERS.includes(m.role)),
  }
}

export async function weeklyDigest(_job: unknown, db: Db, now = Date.now()): Promise<void> {
  const { start, end } = weekWindow(now)
  const fmt = (ms: number) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(ms))
  const rangeLabel = `${fmt(start)} – ${fmt(end - 1)}`
  const weekKey = new Date(start + 330 * 60_000).toISOString().slice(0, 10)
  const { data: orgs } = await db.from('organisations').select('id, name, slug, lifecycle_state').in('lifecycle_state', ['active', 'grace', 'pending_setup'])
  for (const org of orgs ?? []) {
    const { rows, managers } = await loadRows(db, org.id, now)
    if (!managers.length) continue
    const week = computeWeek(rows, now)
    for (const m of managers) {
      const { data: pref } = await db.from('profiles').select('email_weekly_digest').eq('id', m.profileId).maybeSingle()
      if (pref && pref.email_weekly_digest === false) continue
      const to = await emailOf(db, m.profileId)
      const args = { orgName: org.name, firstName: m.name.trim().split(/\s+/)[0] || 'there', rangeLabel, week, urlPath: `/${org.slug}/speed-to-lead?period=7d` }
      const { data: ids, error } = await db.rpc('enqueue_customer_email', {
        p_org: org.id, p_kind: 'weekly_manager', p_event_key: `weekly:${org.id}:${m.profileId}:${weekKey}`, p_recipients: to, p_template: 'weekly.manager', p_payload: { args },
      } as never)
      if (error) { console.error('[weekly-digest] could not queue', error.message); continue }
      for (const id of (ids as string[] | null) ?? []) await deliverOne(db, id)
    }
  }
}
