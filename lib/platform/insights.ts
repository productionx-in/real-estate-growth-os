// lib/platform/insights.ts — the numbers behind each staff role's console home (docs/design/console-roles.md).
// Pure calculations first (unit-tested), then loaders. Workspace metadata and RE’s own data only: never a
// customer's leads, buyers or documents.
import { can, STAGES, type Actor, type Db, type Stage } from '@/lib/platform/portal'

const DAY = 86_400_000

// ── Pure calculations ───────────────────────────────────────────────────────────────────────────
export interface HealthInput {
  lifecycle: string; billingHold: boolean; subStatus: string | null; periodEnd: string | null
  lastSignIn: string | null; urgentCases: number; staleInvites: number
}
export type HealthBand = 'healthy' | 'watch' | 'at_risk'

/** 0–100 customer health with the reasons behind every deduction. See the design doc for the table. */
export function healthScore(h: HealthInput, now = Date.now()): { score: number; band: HealthBand; reasons: string[] } {
  let score = 100
  const reasons: string[] = []
  if (h.lifecycle === 'suspended' || h.billingHold) { score -= 40; reasons.push(h.billingHold ? 'Billing hold' : 'Suspended') }
  if (h.subStatus === 'expired' || h.subStatus === 'past_due') { score -= 25; reasons.push(h.subStatus === 'expired' ? 'Subscription expired' : 'Payment overdue') }
  if (h.subStatus === 'trial' && h.periodEnd && new Date(h.periodEnd).getTime() - now < 7 * DAY) { score -= 15; reasons.push('Trial ends within 7 days') }
  const idle = h.lastSignIn ? (now - new Date(h.lastSignIn).getTime()) / DAY : Infinity
  if (idle >= 30) { score -= 35; reasons.push(h.lastSignIn ? `No sign-in for ${Math.floor(idle)} days` : 'Nobody has signed in yet') }
  else if (idle >= 14) { score -= 20; reasons.push(`No sign-in for ${Math.floor(idle)} days`) }
  if (h.urgentCases > 0) { score -= 10 * h.urgentCases; reasons.push(`${h.urgentCases} urgent support case${h.urgentCases > 1 ? 's' : ''}`) }
  if (h.staleInvites > 0) { score -= 10; reasons.push('Invitations unaccepted for 7+ days') }
  score = Math.max(0, Math.min(100, score))
  return { score, band: score >= 75 ? 'healthy' : score >= 50 ? 'watch' : 'at_risk', reasons }
}

/** Funnel counts per stage, open total and win rate (null until something has closed). */
export function funnel(prospects: { stage: string }[]) {
  const byStage = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>
  for (const p of prospects) if (p.stage in byStage) byStage[p.stage as Stage]++
  const closed = byStage.won + byStage.lost
  return { byStage, open: prospects.length - closed, won: byStage.won, lost: byStage.lost, winRate: closed ? Math.round((100 * byStage.won) / closed) : null }
}

/** Age statistics in hours for active cases. */
export function caseAges(createdAt: string[], now = Date.now()) {
  const ages = createdAt.map((c) => (now - new Date(c).getTime()) / 3_600_000).filter((h) => h >= 0).sort((a, b) => a - b)
  if (!ages.length) return { oldestHours: null, medianHours: null }
  const mid = Math.floor(ages.length / 2)
  return { oldestHours: Math.round(ages[ages.length - 1]), medianHours: Math.round(ages.length % 2 ? ages[mid] : (ages[mid - 1] + ages[mid]) / 2) }
}

/** "3 h", "2 d" — compact durations for queues. */
export function ageLabel(hours: number | null) {
  if (hours === null) return '—'
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} d`
}

// ── Loaders ─────────────────────────────────────────────────────────────────────────────────────
const ACTIVE_CASE = ['open', 'in_progress', 'waiting_on_customer']

/**
 * auth user id → last sign-in, for the given accounts only. Looked up one by one (10 at a time): the bulk
 * "list users" call fails on databases that contain accounts created outside the auth API, and we only ever
 * need customer members anyway.
 */
async function lastSignIns(db: Db, ids: string[]) {
  const out = new Map<string, string | null>()
  const unique = [...new Set(ids)]
  for (let i = 0; i < unique.length; i += 10) {
    await Promise.all(unique.slice(i, i + 10).map(async (id) => {
      // One unreadable account (e.g. created outside the auth API) must not break the console: skip it.
      const { data, error } = await db.auth.admin.getUserById(id)
      if (error) { console.warn(`[insights] last sign-in unavailable for one account: ${error.message}`); return }
      out.set(id, data?.user?.last_sign_in_at ?? null)
    }))
  }
  return out
}

/** Display names for staff ids: full name, else e-mail. */
export async function staffNames(db: Db, ids: (string | null)[]) {
  const want = [...new Set(ids.filter(Boolean) as string[])]
  const names = new Map<string, string>()
  if (!want.length) return names
  const { data } = await db.from('profiles').select('auth_user_id, full_name').in('auth_user_id', want)
  for (const p of data ?? []) if (p.full_name) names.set(p.auth_user_id as string, p.full_name as string)
  for (const id of want) if (!names.has(id)) {
    const { data: u } = await db.auth.admin.getUserById(id)
    names.set(id, u?.user?.email ?? 'Staff member')
  }
  return names
}

export interface CustomerHealthRow {
  id: string; name: string; type: string; lifecycle: string; plan: string | null; subStatus: string | null
  periodEnd: string | null; members: number; seats: number | null; lastSignIn: string | null
  openCases: number; score: number; band: HealthBand; reasons: string[]
}

/** Every workspace with its health, worst first. For roles that may see organisations. */
export async function customerHealth(db: Db, actor: Actor): Promise<CustomerHealthRow[] | null> {
  if (!can(actor.role, 'organisations')) return null
  const weekAgo = new Date(Date.now() - 7 * DAY).toISOString()
  const [orgs, subs, members, cases, invites] = await Promise.all([
    db.from('organisations').select('id, name, type, plan, lifecycle_state, billing_hold').limit(2000),
    db.from('org_subscriptions').select('org_id, status, current_period_end, included_seats, additional_seats'),
    db.from('org_members').select('org_id, profile_id').is('deactivated_at', null),
    db.from('support_cases').select('org_id, priority').in('status', ACTIVE_CASE),
    db.from('org_invitations').select('org_id').eq('status', 'pending').lt('created_at', weekAgo),
  ])
  for (const e of [orgs.error, subs.error, members.error, cases.error, invites.error]) if (e) throw new Error(`customer health: ${e.message}`)
  const sub = new Map((subs.data ?? []).map((s) => [s.org_id as string, s]))
  // org_members links to profiles four ways (member, inviter, deactivator…), so resolve profile ids explicitly.
  const profileIds = [...new Set((members.data ?? []).map((m) => m.profile_id as string))]
  const authOf = new Map<string, string>()
  for (let i = 0; i < profileIds.length; i += 500) {
    const { data, error } = await db.from('profiles').select('id, auth_user_id').in('id', profileIds.slice(i, i + 500))
    if (error) throw new Error(`customer health: ${error.message}`)
    for (const p of data ?? []) if (p.auth_user_id) authOf.set(p.id as string, p.auth_user_id as string)
  }
  const memberIds = new Map<string, string[]>()
  for (const m of members.data ?? []) {
    const authId = authOf.get(m.profile_id as string)
    if (authId) memberIds.set(m.org_id as string, [...(memberIds.get(m.org_id as string) ?? []), authId])
  }
  const signIns = await lastSignIns(db, [...memberIds.values()].flat())
  const tally = (rows: { org_id: string }[] | null, pred: (r: Record<string, unknown>) => boolean = () => true) => {
    const t = new Map<string, number>()
    for (const r of rows ?? []) if (pred(r as Record<string, unknown>)) t.set(r.org_id, (t.get(r.org_id) ?? 0) + 1)
    return t
  }
  const openCases = tally(cases.data as { org_id: string }[])
  const urgent = tally(cases.data as { org_id: string }[], (r) => r.priority === 'urgent')
  const stale = tally(invites.data as { org_id: string }[])
  return (orgs.data ?? []).map((o) => {
    const s = sub.get(o.id as string)
    const ids = memberIds.get(o.id as string) ?? []
    const lastSignIn = ids.map((id) => signIns.get(id)).filter(Boolean).sort().at(-1) ?? null
    const h = healthScore({
      lifecycle: o.lifecycle_state as string, billingHold: Boolean(o.billing_hold), subStatus: (s?.status as string) ?? null,
      periodEnd: (s?.current_period_end as string) ?? null, lastSignIn, urgentCases: urgent.get(o.id as string) ?? 0, staleInvites: stale.get(o.id as string) ?? 0,
    })
    return {
      id: o.id as string, name: o.name as string, type: o.type as string, lifecycle: o.lifecycle_state as string, plan: (o.plan as string) ?? null,
      subStatus: (s?.status as string) ?? null, periodEnd: (s?.current_period_end as string) ?? null, members: ids.length,
      seats: s ? Number(s.included_seats ?? 0) + Number(s.additional_seats ?? 0) : null, lastSignIn,
      openCases: openCases.get(o.id as string) ?? 0, ...h,
    }
  }).sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
}

/** Sales home: funnel, win rate, follow-ups (today/overdue) and, for managers, the team table. */
export async function salesBoard(db: Db, actor: Actor) {
  if (!can(actor.role, 'salesRead')) return null
  const all = can(actor.role, 'salesAll')
  let q = db.from('internal_prospects').select('id, company_name, stage, owner_user_id, next_follow_up_at, source, created_at, city').limit(5000)
  if (!all) q = q.or(`owner_user_id.eq.${actor.userId},owner_user_id.is.null`)
  const { data } = await q
  const rows = (data ?? []) as { id: string; company_name: string; stage: string; owner_user_id: string | null; next_follow_up_at: string | null; source: string; created_at: string; city: string | null }[]
  const now = new Date(), endOfToday = new Date(now); endOfToday.setHours(23, 59, 59, 999)
  const open = rows.filter((r) => !['won', 'lost'].includes(r.stage))
  const mine = open.filter((r) => r.owner_user_id === actor.userId)
  const due = (r: (typeof rows)[number]) => r.next_follow_up_at && new Date(r.next_follow_up_at) <= endOfToday
  const myFollowUps = mine.filter(due).sort((a, b) => (a.next_follow_up_at! < b.next_follow_up_at! ? -1 : 1))
  const unassignedWebsite = open.filter((r) => !r.owner_user_id && r.source === 'website')
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  let team: { userId: string; name: string; open: number; overdue: number; won: number }[] = []
  if (all) {
    const owners = [...new Set(rows.map((r) => r.owner_user_id).filter(Boolean) as string[])]
    const names = await staffNames(db, owners)
    team = owners.map((id) => {
      const theirs = rows.filter((r) => r.owner_user_id === id)
      return {
        userId: id, name: id === actor.userId ? 'You' : names.get(id) ?? 'Staff member',
        open: theirs.filter((r) => !['won', 'lost'].includes(r.stage)).length,
        overdue: theirs.filter((r) => !['won', 'lost'].includes(r.stage) && r.next_follow_up_at && new Date(r.next_follow_up_at) < now).length,
        won: theirs.filter((r) => r.stage === 'won').length,
      }
    }).sort((a, b) => b.overdue - a.overdue || b.open - a.open)
  }
  return {
    funnel: funnel(all ? rows : mine.concat(rows.filter((r) => r.owner_user_id === actor.userId && ['won', 'lost'].includes(r.stage)))),
    myFollowUps: myFollowUps.slice(0, 8),
    myOverdue: mine.filter((r) => r.next_follow_up_at && new Date(r.next_follow_up_at) < now).length,
    myDueToday: myFollowUps.length,
    unassigned: open.filter((r) => !r.owner_user_id).length,
    unassignedWebsite: unassignedWebsite.slice(0, 6),
    newThisMonth: rows.filter((r) => r.created_at >= monthStart).length,
    team, all,
  }
}

/** Support home: queue shape, ages, unassigned, own cases and grants about to lapse. */
export async function supportBoard(db: Db, actor: Actor) {
  if (!can(actor.role, 'supportRead')) return null
  const soon = new Date(Date.now() + DAY).toISOString(), nowIso = new Date().toISOString()
  const weekAgo = new Date(Date.now() - 7 * DAY).toISOString()
  const [active, resolved, grants] = await Promise.all([
    db.from('support_cases').select('id, org_id, subject, priority, status, assignee_user_id, created_at').in('status', ACTIVE_CASE).order('created_at'),
    db.from('support_cases').select('id', { count: 'exact', head: true }).gte('resolved_at', weekAgo),
    db.from('support_access_grants').select('id, org_id, expires_at, status').eq('status', 'active').gt('expires_at', nowIso).lt('expires_at', soon),
  ])
  const cases = (active.data ?? []) as { id: string; org_id: string; subject: string; priority: string; status: string; assignee_user_id: string | null; created_at: string }[]
  const orgIds = [...new Set([...cases.map((c) => c.org_id), ...(grants.data ?? []).map((g) => g.org_id as string)])]
  const { data: orgs } = orgIds.length ? await db.from('organisations').select('id, name').in('id', orgIds) : { data: [] }
  const orgName = new Map((orgs ?? []).map((o) => [o.id as string, o.name as string]))
  const names = await staffNames(db, cases.map((c) => c.assignee_user_id))
  const PRI = ['urgent', 'high', 'normal', 'low']
  return {
    byPriority: Object.fromEntries(PRI.map((p) => [p, cases.filter((c) => c.priority === p).length])) as Record<string, number>,
    total: cases.length,
    unassigned: cases.filter((c) => !c.assignee_user_id).length,
    mine: cases.filter((c) => c.assignee_user_id === actor.userId).length,
    waitingOnCustomer: cases.filter((c) => c.status === 'waiting_on_customer').length,
    resolved7d: resolved.count ?? 0,
    ...caseAges(cases.map((c) => c.created_at)),
    oldest: cases
      .filter((c) => c.status !== 'waiting_on_customer')
      .sort((a, b) => PRI.indexOf(a.priority) - PRI.indexOf(b.priority) || (a.created_at < b.created_at ? -1 : 1))
      .slice(0, 6)
      .map((c) => ({ ...c, org: orgName.get(c.org_id) ?? '—', assignee: c.assignee_user_id ? (c.assignee_user_id === actor.userId ? 'You' : names.get(c.assignee_user_id) ?? 'Staff') : null, ageHours: caseAges([c.created_at]).oldestHours })),
    expiringGrants: (grants.data ?? []).map((g) => ({ id: g.id as string, orgId: g.org_id as string, org: orgName.get(g.org_id as string) ?? '—', expiresAt: g.expires_at as string })),
  }
}

/** Finance home: what needs action and what renews soon. */
export async function financeBoard(db: Db, actor: Actor) {
  if (!['super_admin', 'finance_admin', 'auditor'].includes(actor.role)) return null
  const in30 = new Date(Date.now() + 30 * DAY).toISOString(), nowIso = new Date().toISOString()
  const since7d = new Date(Date.now() - 7 * DAY).toISOString()
  const [alerts, refunds, unapplied, disputes, recon, attempts, renewals] = await Promise.all([
    db.from('payment_alerts').select('id', { count: 'exact', head: true }).is('resolved_at', null),
    db.from('payment_refunds').select('id', { count: 'exact', head: true }).eq('status', 'requested'),
    db.from('unapplied_payments').select('id', { count: 'exact', head: true }).in('status', ['open', 'refund_requested']),
    db.from('payment_disputes').select('id', { count: 'exact', head: true }).in('status', ['open', 'under_review']),
    db.from('payment_reconciliation_items').select('id', { count: 'exact', head: true }).eq('status', 'open').neq('kind', 'matched'),
    db.from('payment_attempts').select('status').gte('created_at', since7d),
    db.from('org_subscriptions').select('org_id, status, current_period_end, plan_tier').in('status', ['active', 'past_due']).gte('current_period_end', nowIso).lte('current_period_end', in30).order('current_period_end'),
  ])
  const done = (attempts.data ?? []).filter((a) => ['captured', 'failed', 'expired'].includes(a.status as string))
  const orgIds = (renewals.data ?? []).map((r) => r.org_id as string)
  const { data: orgs } = orgIds.length ? await db.from('organisations').select('id, name').in('id', orgIds) : { data: [] }
  const orgName = new Map((orgs ?? []).map((o) => [o.id as string, o.name as string]))
  return {
    alerts: alerts.count ?? 0, refundsPending: refunds.count ?? 0, unapplied: unapplied.count ?? 0,
    disputes: disputes.count ?? 0, reconciliation: recon.count ?? 0,
    failed7d: done.filter((a) => a.status !== 'captured').length,
    successRate7d: done.length ? Math.round((100 * done.filter((a) => a.status === 'captured').length) / done.length) : null,
    renewals: (renewals.data ?? []).slice(0, 8).map((r) => ({ orgId: r.org_id as string, org: orgName.get(r.org_id as string) ?? '—', status: r.status as string, plan: r.plan_tier as string, endsAt: r.current_period_end as string })),
    renewalsCount: (renewals.data ?? []).length,
  }
}

/** Auditor/owner: staff actions over the last 7 days by type. */
export async function auditDigest(db: Db, actor: Actor) {
  if (!['super_admin', 'auditor'].includes(actor.role)) return null
  const since = new Date(Date.now() - 7 * DAY).toISOString()
  const { data } = await db.from('platform_audit_logs').select('action').gte('created_at', since).limit(5000)
  const counts = new Map<string, number>()
  for (const r of data ?? []) { const k = String(r.action).split('.')[0]; counts.set(k, (counts.get(k) ?? 0) + 1) }
  return { total: (data ?? []).length, byArea: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8) }
}
