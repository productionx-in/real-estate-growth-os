// lib/feed/items.ts — the sales activity feed (20260101): what an item is, the reactions, who may see the feed, and how a
// change at the top of this week's leaderboard is spotted. Pure; lib/dal/feed.ts builds the items from the CRM's own
// records (the performance ledger, achievement unlocks, trophies, rewards), so the feed never disagrees with them.
import type { GamificationSettings } from '@/lib/performance/rules'

export type FeedKind = 'deal' | 'unlock' | 'target' | 'trophy' | 'reward' | 'lead'
export interface FeedItem {
  /** Stable key: kind + the record it comes from. Reactions attach to it. */
  key: string
  kind: FeedKind
  at: string
  /** Who it is about (a person or a team) — never a customer. */
  who: string
  profileId: string | null
  text: string
  detail: string | null
  /** Booking value, only where the viewer may see it. */
  amount: number | null
  reactions: Partial<Record<ReactionKind, number>>
  mine: ReactionKind[]
}

export const REACTIONS = { clap: 'Applause', fire: 'On fire', heart: 'Love it', trophy: 'Champion' } as const
export type ReactionKind = keyof typeof REACTIONS
export const isReaction = (k: unknown): k is ReactionKind => typeof k === 'string' && k in REACTIONS
export const ITEM_KEY = /^(deal|unlock|target|trophy|reward|lead):[A-Za-z0-9:_-]{1,180}$/

/** May this person open the feed at all? */
export function canSeeFeed(s: GamificationSettings, manager: boolean): boolean {
  return s.enabled && s.feed.enabled && (manager || s.feed.visibleTo === 'everyone')
}
/** May this person see booking values in it? */
export const seesAmounts = (s: GamificationSettings, manager: boolean) => manager || s.feed.showAmounts

/**
 * Who leads this week's points now, and who led before the last `hours` hours (from the same week's events). A change
 * becomes a feed item; ties keep the earlier leader so an equal score never "takes" the lead.
 */
export function leaderChange(rows: { profile_id: string; xp: number; occurred_at: string }[], now: Date, hours = 24): { leader: string; before: string | null; at: string } | null {
  const cut = now.getTime() - hours * 3_600_000
  const lead = (rs: typeof rows) => {
    const t = new Map<string, number>()
    for (const r of rs) t.set(r.profile_id, (t.get(r.profile_id) ?? 0) + r.xp)
    let best: string | null = null, top = 0
    for (const [p, x] of t) if (x > top) { best = p; top = x }
    return { best, t }
  }
  const before = lead(rows.filter((r) => new Date(r.occurred_at).getTime() < cut))
  const after = lead(rows)
  if (!after.best || after.best === before.best) return null
  if (before.best && (after.t.get(before.best) ?? 0) >= (after.t.get(after.best) ?? 0)) return null
  const last = rows.filter((r) => r.profile_id === after.best).map((r) => r.occurred_at).sort().pop() ?? now.toISOString()
  return { leader: after.best, before: before.best, at: last }
}
