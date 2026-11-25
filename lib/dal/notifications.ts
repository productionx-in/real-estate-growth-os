// lib/dal/notifications.ts
// In-app notification inbox. Always scoped to (orgId, recipient = the authenticated caller's profile).
import { bannerKind, type AlertSoundKind } from '@/lib/notifications/lead-alerts'
import { createServiceClient } from '@/lib/supabase/server'

export interface InboxItem {
  id: string
  type: string
  title: string
  body: string
  lead_id: string | null
  /** Set for plot map notifications: the project whose map they are about. */
  project_id?: string | null
  created_at: string
  read_at: string | null
}

export async function getInbox(orgId: string, profileId: string, limit = 30):
  Promise<{ success: true; data: { items: InboxItem[]; unread: number } } | { success: false; error: string; status: number }> {
  const service = createServiceClient()
  const [items, unread] = await Promise.all([
    service.from('notifications').select('id, type, title, body, lead_id, data, created_at, read_at')
      .eq('org_id', orgId).eq('recipient_profile_id', profileId)
      .order('created_at', { ascending: false }).limit(Math.min(Math.max(limit, 1), 100)),
    service.from('notifications').select('id', { count: 'exact', head: true })
      .eq('org_id', orgId).eq('recipient_profile_id', profileId).is('read_at', null),
  ])
  if (items.error || unread.error) return { success: false, error: 'Failed to load notifications', status: 500 }
  // Only the link target leaves the server from the notification's data: a project id, for plot map notifications.
  const shaped = ((items.data ?? []) as (InboxItem & { data?: unknown })[]).map(({ data, ...n }) => {
    const pid = data && typeof data === 'object' ? (data as { project_id?: unknown }).project_id : null
    return { ...n, project_id: typeof pid === 'string' && /^[0-9a-f-]{36}$/.test(pid) ? pid : null }
  })
  return { success: true, data: { items: shaped as InboxItem[], unread: unread.count ?? 0 } }
}

/** Marks the given notifications (or all) as read. Only the caller's own unread notifications are touched. */
export async function markRead(orgId: string, profileId: string, ids: string[] | 'all'):
  Promise<{ success: true; data: { updated: number } } | { success: false; error: string; status: number }> {
  const service = createServiceClient()
  let query = service.from('notifications').update({ read_at: new Date().toISOString() })
    .eq('org_id', orgId).eq('recipient_profile_id', profileId).is('read_at', null)
  if (ids !== 'all') query = query.in('id', ids)
  const { data, error } = await query.select('id')
  if (error) return { success: false, error: 'Failed to update notifications', status: 500 }
  return { success: true, data: { updated: data?.length ?? 0 } }
}

export interface LiveAlert {
  id: string
  kind: AlertSoundKind
  title: string
  body: string
  leadId: string | null
  /** The lead's number, for the banner's "Call" button (new-lead alerts carry it). */
  phone: string | null
  createdAt: string
}

/**
 * The caller's unread lead alerts created after `since` (at most 15 minutes back), newest first — what the in-app
 * banners show (components/notifications/LiveAlerts.tsx). Only alerts with a banner (lib/notifications/lead-alerts.ts).
 */
export async function getLiveAlerts(orgId: string, viewer: { profileId: string; seesAllLeads: boolean }, since: Date): Promise<LiveAlert[] | null> {
  const floor = new Date(Math.max(since.getTime(), Date.now() - 15 * 60_000))
  const service = createServiceClient()
  const { data, error } = await service.from('notifications')
    .select('id, type, title, body, lead_id, data, created_at')
    .eq('org_id', orgId).eq('recipient_profile_id', viewer.profileId).is('read_at', null)
    .in('type', ['lead_new', 'lead_assigned', 'lead_unassigned', 'lead_uncontacted', 'sla_nudge', 'follow_up_due'])
    .gt('created_at', floor.toISOString())
    .order('created_at', { ascending: false }).limit(10)
  if (error) return null
  const out: LiveAlert[] = []
  for (const n of (data ?? []) as { id: string; type: string; title: string; body: string; lead_id: string | null; data: unknown; created_at: string }[]) {
    const d = (n.data && typeof n.data === 'object' ? n.data : {}) as { event?: unknown }
    const kind = bannerKind(n.type, typeof d.event === 'string' ? d.event : null)
    if (!kind) continue
    out.push({ id: n.id, kind, title: n.title, body: n.body, leadId: n.lead_id, phone: null, createdAt: n.created_at })
    if (out.length === 5) break
  }
  // The number for the "Call" button is read now, never stored in the alert, and only for someone who may see the lead
  // right now: its current owner, or a manager (who sees every lead).
  const ids = [...new Set(out.map((a) => a.leadId).filter((x): x is string => !!x))]
  if (ids.length) {
    const { data: leads } = await service.from('leads').select('id, phone, assigned_to').eq('org_id', orgId).in('id', ids)
    const phoneOf = new Map(((leads ?? []) as { id: string; phone: string | null; assigned_to: string | null }[])
      .filter((l) => viewer.seesAllLeads || l.assigned_to === viewer.profileId)
      .map((l) => [l.id, l.phone && /^\+?[0-9 ()-]{6,20}$/.test(l.phone) ? l.phone : null]))
    for (const a of out) a.phone = a.leadId ? phoneOf.get(a.leadId) ?? null : null
  }
  return out
}

export interface AlertLogRow {
  id: string
  when: string
  kind: AlertSoundKind
  title: string
  recipient: string
  read: boolean
  /** Phone or desktop push: sent, skipped (with why), failed, or not attempted (no device turned on / still queued). */
  push: { status: 'sent' | 'skipped' | 'failed' | 'none'; detail: string | null }
}

/** The workspace's latest lead alerts and how each was delivered (Settings → Notification defaults; owners and admins). */
export async function recentLeadAlerts(orgId: string, limit = 40): Promise<AlertLogRow[]> {
  const service = createServiceClient()
  const { data } = await service.from('notifications')
    .select('id, type, title, data, created_at, read_at, recipient_profile_id, profiles!notifications_recipient_profile_id_fkey(full_name), notification_deliveries(channel, status, detail)')
    .eq('org_id', orgId)
    .in('type', ['lead_new', 'lead_assigned', 'lead_unassigned', 'lead_uncontacted', 'sla_nudge', 'follow_up_due'])
    .order('created_at', { ascending: false }).limit(limit * 2)
  const out: AlertLogRow[] = []
  type Row = { id: string; type: string; title: string; data: unknown; created_at: string; read_at: string | null
    profiles: { full_name: string | null } | null; notification_deliveries: { channel: string; status: string; detail: string | null }[] | null }
  for (const n of (data ?? []) as unknown as Row[]) {
    const d = (n.data && typeof n.data === 'object' ? n.data : {}) as { event?: unknown }
    const kind = bannerKind(n.type, typeof d.event === 'string' ? d.event : null)
    if (!kind) continue
    const push = (n.notification_deliveries ?? []).find((x) => x.channel === 'push')
    out.push({
      id: n.id, when: n.created_at, kind, title: n.title, recipient: n.profiles?.full_name ?? 'Team member', read: !!n.read_at,
      push: push ? { status: (['sent', 'skipped', 'failed'].includes(push.status) ? push.status : 'none') as AlertLogRow['push']['status'], detail: push.detail } : { status: 'none', detail: null },
    })
    if (out.length >= limit) break
  }
  return out
}
