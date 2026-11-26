// lib/notifications/kinds.ts — how each kind of in-app notification looks in the inbox (components/notifications/
// NotificationBell.tsx): a short label with an emoji, the icon and colour of its badge, where "Open" goes and what the
// action button says. Pure, so the panel and the tests share one list. Kinds match notifications_type_check.
export type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'info'

export interface KindStyle { label: string; emoji: string; icon: 'sparkles' | 'user' | 'undo' | 'clock' | 'siren' | 'phone' | 'alert' | 'eye' | 'map' | 'hourglass' | 'trophy' | 'gift' | 'bell'; tone: Tone; action: string }

export const NOTIFICATION_KINDS: Record<string, KindStyle> = {
  lead_new: { label: 'New lead', emoji: '🆕', icon: 'sparkles', tone: 'brand', action: 'Open lead' },
  lead_assigned: { label: 'Assigned to you', emoji: '👤', icon: 'user', tone: 'brand', action: 'Open lead' },
  lead_unassigned: { label: 'Reassigned', emoji: '↩️', icon: 'undo', tone: 'info', action: 'View lead' },
  lead_uncontacted: { label: 'Waiting for a call', emoji: '⏳', icon: 'hourglass', tone: 'warning', action: 'Call now' },
  sla_nudge: { label: 'Response due', emoji: '⏰', icon: 'clock', tone: 'warning', action: 'Open lead' },
  sla_breach: { label: 'Response overdue', emoji: '🚨', icon: 'siren', tone: 'danger', action: 'Open lead' },
  follow_up_due: { label: 'Follow-up due', emoji: '📞', icon: 'phone', tone: 'info', action: 'Follow up' },
  follow_up_overdue: { label: 'Follow-up overdue', emoji: '⚠️', icon: 'alert', tone: 'danger', action: 'Follow up' },
  document_viewed: { label: 'Document opened', emoji: '👀', icon: 'eye', tone: 'success', action: 'Open lead' },
  plot_map: { label: 'Plot map', emoji: '🗺️', icon: 'map', tone: 'info', action: 'View map' },
  achievement: { label: 'Celebration', emoji: '🏆', icon: 'trophy', tone: 'success', action: 'See achievements' },
}
/** Celebrations (type 'achievement') by topic. */
export const CELEBRATIONS: Record<string, KindStyle & { href: string }> = {
  reward: { label: 'Reward', emoji: '🎁', icon: 'gift', tone: 'brand', action: 'View rewards', href: '/rewards' },
  trophy: { label: 'Trophy', emoji: '🏆', icon: 'trophy', tone: 'warning', action: 'See trophies', href: '/performance/achievements' },
  level: { label: 'Level up', emoji: '🚀', icon: 'trophy', tone: 'brand', action: 'My performance', href: '/performance?me=1' },
  mission: { label: 'Mission complete', emoji: '✅', icon: 'trophy', tone: 'success', action: 'My performance', href: '/performance?me=1' },
  target: { label: 'Target reached', emoji: '🎯', icon: 'trophy', tone: 'success', action: 'My performance', href: '/performance?me=1' },
  credit: { label: 'Shared deal', emoji: '🤝', icon: 'trophy', tone: 'success', action: 'My performance', href: '/performance?me=1' },
  achievement: { label: 'Achievement', emoji: '🏅', icon: 'trophy', tone: 'success', action: 'See achievements', href: '/performance/achievements' },
}
const OTHER: KindStyle = { label: 'Update', emoji: '🔔', icon: 'bell', tone: 'info', action: 'Open' }

export const kindStyle = (type: string, topic?: string | null): KindStyle =>
  (type === 'achievement' && topic && CELEBRATIONS[topic]) || NOTIFICATION_KINDS[type] || OTHER

/** Where a notification leads. */
export function notificationHref(orgSlug: string, n: { type: string; lead_id: string | null; project_id?: string | null; topic?: string | null }): string {
  if (n.lead_id && !(n.type === 'achievement' && n.topic === 'credit')) return `/${orgSlug}/leads/${n.lead_id}`
  if (n.type === 'achievement' && n.topic && CELEBRATIONS[n.topic]) return `/${orgSlug}${CELEBRATIONS[n.topic].href}`
  if (n.type === 'plot_map' && n.project_id) return `/${orgSlug}/projects/${n.project_id}/map`
  if (n.type === 'achievement') return `/${orgSlug}/performance/achievements`
  return `/${orgSlug}/leads`
}

/** "just now", "5m ago", "3h ago", "2d ago". */
export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
