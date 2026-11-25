// lib/dal/deal-credit.ts — shared deal credit (20260098; rules in lib/sales/deal-credit.ts). Reads the split, what each
// person holds on the lead from the ledger, and the history; changes go through set_deal_credit(), which checks the
// shares and moves the credit in the same transaction. Every query is scoped by organisation.
import { createServiceClient } from '@/lib/supabase/server'
import { CREDIT_ERRORS, CREDIT_ROLES, type Share } from '@/lib/sales/deal-credit'
import { getSalesStructure } from '@/lib/dal/sales-structure'
import { canTakeLeads } from '@/lib/sales/structure'
import type { MemberRole } from '@/types/database'

// The new tables and functions are not in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as unknown as { from: (t: string) => any; rpc: (f: string, a: Record<string, unknown>) => any }

export interface DealCreditView {
  closer: { id: string; name: string } | null
  shares: (Share & { name: string })[]
  /** What each person holds on this lead now, from the ledger. */
  holdings: { profileId: string; name: string; credit: number; revenue: number; xp: number }[]
  history: { id: number; at: string; by: string; before: Share[]; after: Share[]; reason: string | null }[]
  /** People who can be given a share. */
  people: { id: string; name: string; role: MemberRole }[]
}

export async function closerOf(orgId: string, leadId: string): Promise<string | null> {
  const { data } = await db().rpc('deal_closer', { p_org: orgId, p_lead: leadId })
  return (data as string | null) ?? null
}

/** Leaders of the teams the closer is in (they may manage the closer's splits). */
export async function leadersOf(orgId: string, profileId: string): Promise<string[]> {
  const { data } = await db().from('team_members').select('teams!inner(leader_profile_id, is_active)').eq('org_id', orgId).eq('profile_id', profileId)
  return ((data ?? []) as { teams: { leader_profile_id: string | null; is_active: boolean } | null }[])
    .filter((r) => r.teams?.is_active && r.teams.leader_profile_id).map((r) => r.teams!.leader_profile_id!)
}

export async function getDealCredit(orgId: string, leadId: string): Promise<DealCreditView> {
  const [closerId, { data: splits }, { data: events }, { data: history }, { data: members }, sales] = await Promise.all([
    closerOf(orgId, leadId),
    db().from('deal_credit_splits').select('profile_id, share_pct').eq('org_id', orgId).eq('lead_id', leadId),
    db().from('performance_events').select('profile_id, kind, credit, value, xp').eq('org_id', orgId).eq('lead_id', leadId)
      .in('kind', ['deal_closed', 'deal_reversed', 'deal_credit', 'revenue']),
    db().from('deal_credit_history').select('id, before, after, reason, changed_at, profiles!deal_credit_history_changed_by_fkey(full_name)')
      .eq('org_id', orgId).eq('lead_id', leadId).order('changed_at', { ascending: false }).limit(10),
    db().from('org_members').select('profile_id, role, profiles!org_members_profile_id_fkey(full_name)').eq('org_id', orgId).eq('status', 'active'),
    getSalesStructure(orgId),
  ])
  const who = new Map(((members ?? []) as { profile_id: string; role: MemberRole; profiles: { full_name: string | null } | null }[])
    .map((m) => [m.profile_id, { name: m.profiles?.full_name?.trim() || 'Team member', role: m.role }]))
  const name = (id: string) => who.get(id)?.name ?? 'Former member'
  const held = new Map<string, { credit: number; revenue: number; xp: number }>()
  for (const e of (events ?? []) as { profile_id: string; kind: string; credit: number | string; value: number | string; xp: number }[]) {
    const h = held.get(e.profile_id) ?? { credit: 0, revenue: 0, xp: 0 }
    if (e.kind !== 'revenue') { h.credit += Number(e.credit); h.xp += e.xp }
    if (e.kind === 'revenue' || e.kind === 'deal_credit') h.revenue += Number(e.value)
    held.set(e.profile_id, h)
  }
  const r4 = (n: number) => Math.round(n * 10000) / 10000
  return {
    closer: closerId ? { id: closerId, name: name(closerId) } : null,
    shares: ((splits ?? []) as { profile_id: string; share_pct: number | string }[])
      .map((s) => ({ profileId: s.profile_id, sharePct: Number(s.share_pct), name: name(s.profile_id) })).sort((a, b) => b.sharePct - a.sharePct),
    holdings: [...held.entries()].map(([profileId, h]) => ({ profileId, name: name(profileId), credit: r4(h.credit), revenue: Math.round(h.revenue * 100) / 100, xp: h.xp }))
      .filter((h) => h.credit !== 0 || h.revenue !== 0 || h.xp !== 0).sort((a, b) => b.credit - a.credit),
    history: ((history ?? []) as { id: number; before: Share[]; after: Share[]; reason: string | null; changed_at: string; profiles: { full_name: string | null } | null }[])
      .map((h) => ({ id: h.id, at: h.changed_at, by: h.profiles?.full_name?.trim() || 'Someone', before: h.before, after: h.after, reason: h.reason })),
    // Only people who sell can be offered a share (an owner who only manages is left out, Settings → Sales structure).
    people: [...who.entries()].filter(([, m]) => CREDIT_ROLES.includes(m.role) && canTakeLeads(m.role, sales)).map(([id, m]) => ({ id, name: m.name, role: m.role }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }
}

export async function saveDealCredit(orgId: string, leadId: string, shares: Share[], by: string, reason: string | null):
  Promise<{ ok: true; changed: boolean } | { ok: false; error: string }> {
  const { data, error } = await db().rpc('set_deal_credit', { p_org: orgId, p_lead: leadId, p_shares: shares, p_by: by, p_reason: reason })
  if (error) {
    const code = Object.keys(CREDIT_ERRORS).find((k) => (error.message as string)?.includes(k))
    return { ok: false, error: code ? CREDIT_ERRORS[code] : 'The split could not be saved.' }
  }
  return { ok: true, changed: data !== null }
}
