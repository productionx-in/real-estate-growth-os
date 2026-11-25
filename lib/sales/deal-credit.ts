// lib/sales/deal-credit.ts — shared deal credit (20260098): the rules the API, the lead page and the tests share. The
// database checks the same things again in set_deal_credit(); this exists so a person gets a clear message first.
//
// The closer of a booked deal holds 100% unless others are given a share. Shares are percentages with at most two
// decimals, each above 0 and below 100, at most nine people besides the closer, and together under 100: the closer
// always keeps the remainder, so the total is exactly 100% and can never be more.
import type { MemberRole } from '@/types/database'

export interface Share { profileId: string; sharePct: number }

/** Who may change how a deal's credit is shared, besides the closer's own team leader. */
export const CREDIT_MANAGERS = ['owner', 'admin', 'manager'] as const satisfies readonly MemberRole[]
export const MAX_SHARERS = 9
/** Roles that can be given a share: people who sell. */
export const CREDIT_ROLES: readonly MemberRole[] = ['owner', 'admin', 'manager', 'team_lead', 'sales_exec']

/**
 * May this person change the split? Owners, admins and managers always; a team lead only for a deal closed by someone
 * in a team they lead. Nobody else — the closer cannot give their own credit away, and a contributor cannot claim it.
 */
export function canManageDealCredit(role: MemberRole, viewerId: string, closerLeaderIds: readonly string[]): boolean {
  if ((CREDIT_MANAGERS as readonly string[]).includes(role)) return true
  return role === 'team_lead' && closerLeaderIds.includes(viewerId)
}

/** Checks and tidies the shares sent by a person. */
export function normaliseShares(raw: unknown, closerId: string): { value: Share[]; error: string | null } {
  if (!Array.isArray(raw)) return { value: [], error: 'Send a list of shares.' }
  if (raw.length > MAX_SHARERS) return { value: [], error: `Up to ${MAX_SHARERS} people can share a deal with its closer.` }
  const out: Share[] = []
  for (const r of raw) {
    const o = (r ?? {}) as Record<string, unknown>
    const id = typeof o.profileId === 'string' ? o.profileId : ''
    const pct = typeof o.sharePct === 'number' ? o.sharePct : Number.NaN
    if (!/^[0-9a-f-]{36}$/i.test(id)) return { value: [], error: 'Choose a person for each share.' }
    if (id === closerId) return { value: [], error: 'The closer holds the remainder; they are not given a share.' }
    if (out.some((s) => s.profileId === id)) return { value: [], error: 'Each person can be listed once.' }
    if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) return { value: [], error: 'Each share must be more than 0% and less than 100%.' }
    if (Math.abs(pct * 100 - Math.round(pct * 100)) > 1e-6) return { value: [], error: 'Use at most two decimals in a share.' }
    out.push({ profileId: id, sharePct: Math.round(pct * 100) / 100 })
  }
  const total = out.reduce((s, x) => s + x.sharePct, 0)
  if (total >= 100 - 1e-9) return { value: [], error: 'Together the shares must be under 100%, so the closer keeps part of the deal.' }
  return { value: out, error: null }
}

/** What the closer keeps, in percent. */
export function closerRemainder(shares: readonly Share[]): number {
  return Math.round((100 - shares.reduce((s, x) => s + x.sharePct, 0)) * 100) / 100
}

/** Split presets offered in the editor. */
export const SPLIT_PRESETS: { label: string; closer: number }[] = [
  { label: '50 / 50', closer: 50 }, { label: '70 / 30', closer: 70 }, { label: '60 / 40', closer: 60 },
]

/** Messages for the database's refusals (set_deal_credit). */
export const CREDIT_ERRORS: Record<string, string> = {
  not_booked: 'Only a booked deal can be shared.',
  no_closer: 'This deal has no closer on record yet.',
  invalid_shares: `Up to ${MAX_SHARERS} people can share a deal with its closer.`,
  invalid_share: 'Each share must be more than 0% and less than 100%, with at most two decimals.',
  invalid_person: 'Each person must be an active salesperson in this workspace, other than the closer.',
  duplicate_person: 'Each person can be listed once.',
  over_100: 'Together the shares must be under 100%, so the closer keeps part of the deal.',
}

/** A fractional deal count for display: 1, 0.5, 2.25. */
export function fmtDeals(n: number): string {
  const v = Math.round(Math.max(0, n) * 100) / 100
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, '')
}
