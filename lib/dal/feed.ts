// lib/dal/feed.ts — the sales activity feed (20260101; rules in lib/feed/items.ts), built from records that already exist:
// bookings and targets reached (performance ledger), achievements unlocked, trophies, rewards approved, and a new leader
// on this week's board. Shows people, teams and projects — never a customer's name or contact. Booking values only for
// those allowed (seesAmounts). Every query is scoped by organisation.
import { createServiceClient } from '@/lib/supabase/server'
import { leaderChange, type FeedItem, type ReactionKind } from '@/lib/feed/items'
import { periodWindow } from '@/lib/performance/rules'
import { orgTimezone } from '@/lib/dal/performance'

// The newer tables are not in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as unknown as { from: (t: string) => any }

const METRIC_TEXT: Record<string, string> = { assigned: 'leads assigned', contacted: 'leads contacted', follow_ups: 'follow-ups', meetings: 'site visits', closed: 'deals', revenue: 'revenue' }
const PERIOD_TEXT: Record<string, string> = { day: 'daily', week: 'weekly', month: 'monthly', custom: '' }

export async function getFeed(orgId: string, viewerId: string, opts: { amounts: boolean; leaderboard: boolean; days?: number; limit?: number; now?: Date }): Promise<FeedItem[]> {
  const now = opts.now ?? new Date()
  const since = new Date(now.getTime() - (opts.days ?? 30) * 864e5).toISOString()
  const tz = await orgTimezone(orgId)
  const week = periodWindow('week', now, tz)
  const [{ data: deals }, { data: targets }, { data: unlocks }, { data: trophies }, { data: rewards }, { data: members }, { data: weekRows }] = await Promise.all([
    db().from('performance_events').select('id, profile_id, lead_id, occurred_at, dedupe_key').eq('org_id', orgId).eq('kind', 'deal_closed').gte('occurred_at', since).order('occurred_at', { ascending: false }).limit(100),
    db().from('performance_events').select('id, profile_id, occurred_at, detail').eq('org_id', orgId).eq('kind', 'target_hit').gte('occurred_at', since).order('occurred_at', { ascending: false }).limit(100),
    db().from('achievement_unlocks').select('profile_id, key, window_start, title, unlocked_at').eq('org_id', orgId).gte('unlocked_at', since).order('unlocked_at', { ascending: false }).limit(100),
    db().from('performance_trophies').select('id, period_kind, period_start, scope, place, profile_id, name, awarded_at').eq('org_id', orgId).gte('awarded_at', since).limit(60),
    db().from('reward_claims').select('id, profile_id, name, status, decided_at, reward_programs!inner(title, reward_detail)').eq('org_id', orgId).in('status', ['approved', 'fulfilled', 'redeemed']).gte('decided_at', since).limit(60),
    db().from('org_members').select('profile_id, profiles!org_members_profile_id_fkey(full_name)').eq('org_id', orgId),
    opts.leaderboard ? db().from('performance_events').select('profile_id, xp, occurred_at').eq('org_id', orgId).gte('occurred_at', week.from.toISOString()).lt('occurred_at', week.to.toISOString()).limit(20000) : Promise.resolve({ data: [] }),
  ])
  const names = new Map(((members ?? []) as { profile_id: string; profiles: { full_name: string | null } | null }[]).map((m) => [m.profile_id, m.profiles?.full_name?.trim() || 'Team member']))
  const name = (id: string | null) => (id ? names.get(id) ?? 'Former member' : 'Someone')
  const out: Omit<FeedItem, 'reactions' | 'mine'>[] = []

  // Bookings still standing (a reversed one is not celebrated), with the project, never the customer.
  const dealRows = (deals ?? []) as { id: string; profile_id: string; lead_id: string | null; occurred_at: string; dedupe_key: string }[]
  const leadIds = [...new Set(dealRows.map((d) => d.lead_id).filter((x): x is string => !!x))]
  const [{ data: reversed }, { data: leads }, { data: revenue }] = leadIds.length ? await Promise.all([
    db().from('performance_events').select('dedupe_key').eq('org_id', orgId).eq('kind', 'deal_reversed').in('lead_id', leadIds),
    db().from('leads_all').select('id, projects(name)').eq('org_id', orgId).in('id', leadIds),
    opts.amounts ? db().from('performance_events').select('lead_id, value').eq('org_id', orgId).eq('kind', 'revenue').in('lead_id', leadIds) : Promise.resolve({ data: [] }),
  ]) : [{ data: [] }, { data: [] }, { data: [] }]
  const gone = new Set(((reversed ?? []) as { dedupe_key: string }[]).map((r) => r.dedupe_key.replace(/^deal_reversed:/, 'deal:')))
  const project = new Map(((leads ?? []) as { id: string; projects: { name: string } | null }[]).map((l) => [l.id, l.projects?.name ?? null]))
  const value = new Map<string, number>()
  for (const r of (revenue ?? []) as { lead_id: string; value: number | string }[]) value.set(r.lead_id, (value.get(r.lead_id) ?? 0) + Number(r.value))
  for (const d of dealRows) {
    if (gone.has(d.dedupe_key)) continue
    const p = d.lead_id ? project.get(d.lead_id) : null
    out.push({ key: `deal:${d.id}`, kind: 'deal', at: d.occurred_at, who: name(d.profile_id), profileId: d.profile_id, text: 'closed a deal', detail: p ? `at ${p}` : null,
      amount: opts.amounts && d.lead_id && (value.get(d.lead_id) ?? 0) > 0 ? value.get(d.lead_id)! : null })
  }
  for (const t of (targets ?? []) as { id: string; profile_id: string; occurred_at: string; detail: { metric?: string; period?: string } | null }[]) {
    const per = PERIOD_TEXT[t.detail?.period ?? ''] ?? ''
    out.push({ key: `target:${t.id}`, kind: 'target', at: t.occurred_at, who: name(t.profile_id), profileId: t.profile_id, text: `reached ${per ? `their ${per}` : 'a'} target`, detail: METRIC_TEXT[t.detail?.metric ?? ''] ?? null, amount: null })
  }
  for (const u of (unlocks ?? []) as { profile_id: string; key: string; window_start: string; title: string; unlocked_at: string }[]) {
    out.push({ key: `unlock:${u.profile_id}:${u.key}:${u.window_start}`, kind: 'unlock', at: u.unlocked_at, who: name(u.profile_id), profileId: u.profile_id, text: 'unlocked an achievement', detail: u.title, amount: null })
  }
  for (const t of (trophies ?? []) as { id: string; period_kind: string; period_start: string; scope: string; place: number; profile_id: string | null; name: string; awarded_at: string }[]) {
    const medal = ['', 'gold', 'silver', 'bronze'][t.place]
    out.push({ key: `trophy:${t.id}`, kind: 'trophy', at: t.awarded_at, who: t.name, profileId: t.profile_id, text: `won ${t.scope === 'team' ? 'the team ' : 'a '}${medal} trophy`, detail: t.period_kind === 'week' ? 'for last week' : 'for last month', amount: null })
  }
  for (const r of (rewards ?? []) as { id: string; profile_id: string | null; name: string; decided_at: string; reward_programs: { title: string; reward_detail: string } }[]) {
    out.push({ key: `reward:${r.id}`, kind: 'reward', at: r.decided_at, who: r.name, profileId: r.profile_id, text: `won ${r.reward_programs.reward_detail}`, detail: r.reward_programs.title, amount: null })
  }
  if (opts.leaderboard) {
    const ch = leaderChange((weekRows ?? []) as { profile_id: string; xp: number; occurred_at: string }[], now)
    if (ch) out.push({ key: `lead:${week.from.toISOString().slice(0, 10)}:${ch.leader}`, kind: 'lead', at: ch.at, who: name(ch.leader), profileId: ch.leader, text: 'took the lead on this week’s leaderboard', detail: ch.before ? `ahead of ${name(ch.before)}` : null, amount: null })
  }

  const items = out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, opts.limit ?? 60)
  const keys = items.map((i) => i.key)
  const { data: rx } = keys.length ? await db().from('feed_reactions').select('item_key, profile_id, kind').eq('org_id', orgId).in('item_key', keys) : { data: [] }
  return items.map((i) => {
    const mineRx = ((rx ?? []) as { item_key: string; profile_id: string; kind: ReactionKind }[]).filter((r) => r.item_key === i.key)
    const reactions: Partial<Record<ReactionKind, number>> = {}
    for (const r of mineRx) reactions[r.kind] = (reactions[r.kind] ?? 0) + 1
    return { ...i, reactions, mine: mineRx.filter((r) => r.profile_id === viewerId).map((r) => r.kind) }
  })
}

/** Adds or removes this person's reaction. */
export async function toggleReaction(orgId: string, itemKey: string, profileId: string, kind: ReactionKind): Promise<boolean> {
  const { data } = await db().from('feed_reactions').select('kind').eq('org_id', orgId).eq('item_key', itemKey).eq('profile_id', profileId).eq('kind', kind).maybeSingle()
  if (data) { await db().from('feed_reactions').delete().eq('org_id', orgId).eq('item_key', itemKey).eq('profile_id', profileId).eq('kind', kind); return false }
  const { error } = await db().from('feed_reactions').insert({ org_id: orgId, item_key: itemKey, profile_id: profileId, kind })
  if (error) throw new Error(`reaction: ${error.message}`)
  return true
}
