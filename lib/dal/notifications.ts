// lib/dal/notifications.ts
// In-app notification inbox. Always scoped to (orgId, recipient = the authenticated caller's profile).
import { createServiceClient } from '@/lib/supabase/server'

export interface InboxItem {
  id: string
  type: string
  title: string
  body: string
  lead_id: string | null
  created_at: string
  read_at: string | null
}

export async function getInbox(orgId: string, profileId: string, limit = 30):
  Promise<{ success: true; data: { items: InboxItem[]; unread: number } } | { success: false; error: string; status: number }> {
  const service = createServiceClient()
  const [items, unread] = await Promise.all([
    service.from('notifications').select('id, type, title, body, lead_id, created_at, read_at')
      .eq('org_id', orgId).eq('recipient_profile_id', profileId)
      .order('created_at', { ascending: false }).limit(Math.min(Math.max(limit, 1), 100)),
    service.from('notifications').select('id', { count: 'exact', head: true })
      .eq('org_id', orgId).eq('recipient_profile_id', profileId).is('read_at', null),
  ])
  if (items.error || unread.error) return { success: false, error: 'Failed to load notifications', status: 500 }
  return { success: true, data: { items: (items.data ?? []) as InboxItem[], unread: unread.count ?? 0 } }
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
