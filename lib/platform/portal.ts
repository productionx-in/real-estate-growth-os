// lib/platform/portal.ts — REGrow's internal experiences: Platform Admin, Internal Sales, Internal Support.
// Every function takes the acting staff member ({ userId, role }) and checks what that role may do, on the server,
// before touching data (the routes also check the role and MFA first). Sales never reads customer CRM tables;
// support reads customer-opened cases only — customer business data still needs a customer-approved support grant.
// Every write is recorded in platform_audit_logs.
import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = SupabaseClient<any, 'public', any>
export type StaffRole = 'super_admin' | 'platform_admin' | 'finance_admin' | 'sales_manager' | 'sales_rep' | 'support_agent' | 'auditor'
export interface Actor { userId: string; role: StaffRole }
export type Result<T> = { success: true; data: T } | { success: false; error: string; status: number }
const fail = (error: string, status: number): Result<never> => ({ success: false, error, status })

/** What each role may do in the internal portal. The single source for routes, pages and navigation. */
export const CAN = {
  dashboard: ['super_admin', 'platform_admin', 'finance_admin', 'sales_manager', 'sales_rep', 'support_agent', 'auditor'],
  organisations: ['super_admin', 'platform_admin', 'finance_admin', 'sales_manager', 'sales_rep', 'support_agent', 'auditor'],
  staff: ['super_admin'],
  salesRead: ['super_admin', 'sales_manager', 'sales_rep', 'auditor'],
  salesWrite: ['super_admin', 'sales_manager', 'sales_rep'],
  salesAll: ['super_admin', 'sales_manager', 'auditor'],
  supportRead: ['super_admin', 'platform_admin', 'support_agent', 'auditor'],
  supportWrite: ['super_admin', 'platform_admin', 'support_agent'],
} as const satisfies Record<string, readonly StaffRole[]>
export const can = (role: StaffRole, what: keyof typeof CAN) => (CAN[what] as readonly StaffRole[]).includes(role)

export const ROLE_LABEL: Record<StaffRole, string> = {
  super_admin: 'Platform Owner', platform_admin: 'Platform admin', finance_admin: 'Finance', sales_manager: 'Sales manager',
  sales_rep: 'Sales executive', support_agent: 'Support', auditor: 'Auditor (read-only)',
}

async function audit(db: Db, actor: Actor, action: string, type: string, id: string, metadata: Record<string, unknown> = {}) {
  const { error } = await db.from('platform_audit_logs').insert({ actor_user_id: actor.userId, actor_role: actor.role, action, target_entity_type: type, target_entity_id: id, metadata })
  if (error) throw new Error(`audit failed: ${error.message}`)
}

// ── Dashboard (real figures only) ──────────────────────────────────────────────────────────────
export async function dashboardFigures(db: Db, actor: Actor) {
  if (!can(actor.role, 'dashboard')) return null
  const soon = new Date(Date.now() + 7 * 86_400_000).toISOString()
  const [orgs, subs, cases, prospects, grants] = await Promise.all([
    db.from('organisations').select('type, lifecycle_state, billing_hold'),
    db.from('org_subscriptions').select('status, billing_cycle, contracted_base_price_cents, additional_seats, contracted_additional_seat_price_cents, current_period_end'),
    can(actor.role, 'supportRead') ? db.from('support_cases').select('status, priority').in('status', ['open', 'in_progress', 'waiting_on_customer']) : Promise.resolve({ data: [] }),
    can(actor.role, 'salesRead') ? scopedProspects(db, actor).select('stage, next_follow_up_at') : Promise.resolve({ data: [] }),
    db.from('support_access_grants').select('status').in('status', ['pending', 'active']),
  ])
  const o = orgs.data ?? [], s = subs.data ?? []
  const active = s.filter((x) => x.status === 'active' || x.status === 'past_due')
  // Monthly recurring revenue from contracted prices (annual contracts as twelfths), before GST.
  const mrrPaise = active.reduce((sum, x) => {
    const base = Number(x.contracted_base_price_cents ?? 0) + Number(x.additional_seats ?? 0) * Number(x.contracted_additional_seat_price_cents ?? 0) * (x.billing_cycle === 'annual' ? 10 : 1)
    return sum + (x.billing_cycle === 'annual' ? base / 12 : base)
  }, 0)
  const p = (prospects.data ?? []) as unknown as { stage: string; next_follow_up_at: string | null }[]
  return {
    organisations: { developer: o.filter((x) => x.type === 'developer').length, agency: o.filter((x) => x.type === 'channel_partner').length, readOnly: o.filter((x) => x.billing_hold || x.lifecycle_state === 'suspended').length },
    subscriptions: { paying: active.length, trial: s.filter((x) => x.status === 'trial').length, trialsEndingThisWeek: s.filter((x) => x.status === 'trial' && x.current_period_end && x.current_period_end < soon).length, expired: s.filter((x) => x.status === 'expired').length },
    mrrPaise: Math.round(mrrPaise),
    support: { open: (cases.data ?? []).length, urgent: ((cases.data ?? []) as { priority: string }[]).filter((c) => c.priority === 'urgent').length, grants: (grants.data ?? []).length },
    sales: can(actor.role, 'salesRead') ? {
      open: p.filter((x) => !['won', 'lost'].includes(x.stage)).length,
      won: p.filter((x) => x.stage === 'won').length,
      followUpsDue: p.filter((x) => x.next_follow_up_at && x.next_follow_up_at < new Date().toISOString() && !['won', 'lost'].includes(x.stage)).length,
    } : null,
  }
}

/** Counts of `dates` per week for the last `weeks` weeks, oldest first (week = 7 days ending at `now`). */
export function weeklySeries(dates: (string | null | undefined)[], weeks: number, now = Date.now()): number[] {
  const out = new Array(weeks).fill(0)
  const WEEK = 7 * 86_400_000
  for (const d of dates) {
    if (!d) continue
    const age = now - new Date(d).getTime()
    if (age < 0 || Number.isNaN(age)) continue
    const i = weeks - 1 - Math.floor(age / WEEK)
    if (i >= 0) out[i]++
  }
  return out
}

/** Sidebar badges: open support cases and overdue sales follow-ups, only for roles that can see them. */
export async function consoleNavCounts(db: Db, actor: Actor) {
  const nowIso = new Date().toISOString()
  const [cases, due] = await Promise.all([
    can(actor.role, 'supportRead') ? db.from('support_cases').select('id', { count: 'exact', head: true }).in('status', ['open', 'in_progress', 'waiting_on_customer']) : Promise.resolve({ count: 0 }),
    can(actor.role, 'salesRead') ? scopedProspects(db, actor).select('stage, next_follow_up_at') : Promise.resolve({ data: [] }),
  ])
  const p = ((due as { data?: unknown[] }).data ?? []) as { stage: string; next_follow_up_at: string | null }[]
  return {
    support: (cases as { count?: number | null }).count ?? 0,
    followUps: p.filter((x) => x.next_follow_up_at && x.next_follow_up_at < nowIso && !['won', 'lost'].includes(x.stage)).length,
  }
}

const AUDIT_READERS: StaffRole[] = ['super_admin', 'auditor']

/** Dashboard trend and activity. Workspace metadata and staff actions only; never customer business data. */
export async function dashboardActivity(db: Db, actor: Actor, weeks = 12) {
  if (!can(actor.role, 'dashboard')) return null
  const since = new Date(Date.now() - weeks * 7 * 86_400_000).toISOString()
  const [orgs, prospects, audit] = await Promise.all([
    db.from('organisations').select('created_at').gte('created_at', since),
    can(actor.role, 'salesRead') ? scopedProspects(db, actor).select('created_at') : Promise.resolve({ data: [] }),
    AUDIT_READERS.includes(actor.role)
      ? db.from('platform_audit_logs').select('id, created_at, actor_role, action, target_entity_type').order('created_at', { ascending: false }).limit(6)
      : Promise.resolve({ data: [] }),
  ])
  const prospectDates = ((prospects as { data?: unknown[] }).data ?? []) as { created_at: string }[]
  return {
    workspaces: weeklySeries((orgs.data ?? []).map((o) => o.created_at as string), weeks),
    prospects: can(actor.role, 'salesRead') ? weeklySeries(prospectDates.map((x) => x.created_at), weeks) : null,
    recent: ((audit as { data?: unknown[] }).data ?? []) as { id: string; created_at: string; actor_role: string; action: string; target_entity_type: string }[],
  }
}

// ── Internal Sales ─────────────────────────────────────────────────────────────────────────────
export interface Prospect {
  id: string; company_name: string; org_type: 'developer' | 'channel_partner'; city: string | null; team_size: number | null
  source: string; campaign: string | null; stage: Stage; lost_reason: string | null; owner_user_id: string | null
  contact_name: string | null; contact_email: string | null; contact_phone: string | null; notes: string | null
  next_follow_up_at: string | null; linked_org_id: string | null; created_at: string; updated_at: string
}

export const STAGES = ['new', 'contacted', 'interested', 'qualified', 'demo_scheduled', 'demo_done', 'trial_started', 'negotiation', 'won', 'lost'] as const
export type Stage = (typeof STAGES)[number]

/** Sales executives see their own and unassigned prospects; managers, the Platform Owner and auditors see all. */
function scopedProspects(db: Db, actor: Actor) {
  return {
    select: (cols: string) => {
      const q = db.from('internal_prospects').select(cols)
      return can(actor.role, 'salesAll') ? q : q.or(`owner_user_id.eq.${actor.userId},owner_user_id.is.null`)
    },
  }
}

export async function listProspects(db: Db, actor: Actor, filter: { stage?: string; mine?: boolean } = {}) {
  if (!can(actor.role, 'salesRead')) return fail('Not permitted.', 403)
  let q = scopedProspects(db, actor).select('*').order('updated_at', { ascending: false }).limit(300)
  if (filter.stage && (STAGES as readonly string[]).includes(filter.stage)) q = q.eq('stage', filter.stage)
  if (filter.mine) q = q.eq('owner_user_id', actor.userId)
  const { data, error } = await q
  if (error) return fail(error.message, 500)
  return { success: true as const, data: (data ?? []) as unknown as Prospect[] }
}

async function loadVisibleProspect(db: Db, actor: Actor, id: string) {
  const { data } = await db.from('internal_prospects').select('*').eq('id', id).maybeSingle<Prospect>()
  if (!data) return null
  if (!can(actor.role, 'salesAll') && data.owner_user_id && data.owner_user_id !== actor.userId) return null // not theirs: as if absent
  return data
}

export async function getProspect(db: Db, actor: Actor, id: string) {
  if (!can(actor.role, 'salesRead')) return fail('Not permitted.', 403)
  const p = await loadVisibleProspect(db, actor, id)
  if (!p) return fail('Prospect not found.', 404)
  const { data: activities } = await db.from('internal_prospect_activities').select('*').eq('prospect_id', id).order('created_at', { ascending: false })
  return { success: true as const, data: { ...p, activities: activities ?? [] } }
}

export interface ProspectInput {
  companyName: string; orgType: 'developer' | 'channel_partner'; city?: string | null; teamSize?: number | null
  source: 'website' | 'referral' | 'event' | 'outbound' | 'partner' | 'other'; campaign?: string | null
  contactName?: string | null; contactEmail?: string | null; contactPhone?: string | null; notes?: string | null; nextFollowUpAt?: string | null
}

export async function createProspect(db: Db, actor: Actor, input: ProspectInput) {
  if (!can(actor.role, 'salesWrite')) return fail('Not permitted.', 403)
  const { data, error } = await db.from('internal_prospects').insert({
    company_name: input.companyName, org_type: input.orgType, city: input.city ?? null, team_size: input.teamSize ?? null, source: input.source,
    campaign: input.campaign ?? null, contact_name: input.contactName ?? null, contact_email: input.contactEmail ?? null, contact_phone: input.contactPhone ?? null,
    notes: input.notes ?? null, next_follow_up_at: input.nextFollowUpAt ?? null,
    owner_user_id: actor.role === 'sales_rep' ? actor.userId : null, created_by: actor.userId,
  }).select('id').single()
  if (error) return fail(error.message.includes('check') ? 'Some details are not valid.' : error.message, 400)
  await audit(db, actor, 'sales.prospect_created', 'internal_prospects', data.id, { company: input.companyName })
  return { success: true as const, data: { id: data.id as string } }
}

export async function updateProspect(db: Db, actor: Actor, id: string, change: { stage?: Stage; lostReason?: string | null; ownerUserId?: string | null; nextFollowUpAt?: string | null; notes?: string | null }) {
  if (!can(actor.role, 'salesWrite')) return fail('Not permitted.', 403)
  const p = await loadVisibleProspect(db, actor, id)
  if (!p) return fail('Prospect not found.', 404)
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const log: string[] = []
  if (change.ownerUserId !== undefined && change.ownerUserId !== p.owner_user_id) {
    // Executives may only take an unassigned prospect for themselves; managers and the owner assign anyone on sales.
    if (!can(actor.role, 'salesAll')) {
      if (p.owner_user_id || change.ownerUserId !== actor.userId) return fail('Only a sales manager can reassign prospects.', 403)
    } else if (change.ownerUserId) {
      const { data: target } = await db.from('platform_users').select('role').eq('user_id', change.ownerUserId).eq('is_active', true).maybeSingle()
      if (!target || !['sales_rep', 'sales_manager', 'super_admin'].includes(target.role)) return fail('Prospects can only be assigned to sales staff.', 400)
    }
    patch.owner_user_id = change.ownerUserId
    log.push(`assigned to ${change.ownerUserId ?? 'nobody'}`)
  }
  if (change.stage && change.stage !== p.stage) {
    if (change.stage === 'lost' && !change.lostReason?.trim()) return fail('Say why the prospect was lost.', 400)
    patch.stage = change.stage
    patch.lost_reason = change.stage === 'lost' ? change.lostReason!.trim() : null
    log.push(`stage ${p.stage} → ${change.stage}`)
  }
  if (change.nextFollowUpAt !== undefined) patch.next_follow_up_at = change.nextFollowUpAt
  if (change.notes !== undefined) patch.notes = change.notes
  const { error } = await db.from('internal_prospects').update(patch).eq('id', id)
  if (error) return fail(error.message, 400)
  for (const l of log) await db.from('internal_prospect_activities').insert({ prospect_id: id, kind: l.startsWith('stage') ? 'stage_change' : 'assignment', body: l, actor: actor.userId })
  await audit(db, actor, 'sales.prospect_updated', 'internal_prospects', id, { changes: log, followUp: change.nextFollowUpAt ?? undefined })
  return { success: true as const, data: { id } }
}

export async function addProspectActivity(db: Db, actor: Actor, id: string, kind: 'call' | 'email' | 'meeting' | 'note', body: string) {
  if (!can(actor.role, 'salesWrite')) return fail('Not permitted.', 403)
  if (!(await loadVisibleProspect(db, actor, id))) return fail('Prospect not found.', 404)
  const { error } = await db.from('internal_prospect_activities').insert({ prospect_id: id, kind, body, actor: actor.userId })
  if (error) return fail('Could not save the activity.', 400)
  await db.from('internal_prospects').update({ updated_at: new Date().toISOString() }).eq('id', id)
  await audit(db, actor, 'sales.activity_logged', 'internal_prospects', id, { kind })
  return { success: true as const, data: { id } }
}

/**
 * Demo and consultation requests from the website arrive as leads in REGrow's own workspace (the website form's
 * connection, REGROW_DEMO_FORM_CONNECTION_ID). Import them as prospects, once each. Reads only that connection's
 * leads — REGrow's own enquiries, never a customer's.
 */
export async function importWebsiteRequests(db: Db, actor: Actor, connectionId: string | null) {
  if (!can(actor.role, 'salesAll') || actor.role === 'auditor') return fail('Only a sales manager or the Platform Owner can import requests.', 403)
  if (!connectionId) return fail('The website form connection is not configured (REGROW_DEMO_FORM_CONNECTION_ID).', 503)
  const { data: leads, error } = await db.from('leads').select('id, name, phone, email, notes, campaign_name, created_at').eq('connection_id', connectionId).order('created_at', { ascending: false }).limit(500)
  if (error) return fail(error.message, 500)
  let imported = 0
  for (const l of leads ?? []) {
    const notes = String(l.notes ?? '')
    const field = (label: string) => notes.match(new RegExp(`^${label}: (.+)$`, 'm'))?.[1]?.trim() ?? null
    const company = field('Company')
    const { error: e } = await db.from('internal_prospects').insert({
      company_name: (company?.replace(/\s*\((Developer \/ builder|Channel-partner agency)\)$/, '') || l.name || 'Website request').slice(0, 200),
      org_type: /Channel-partner agency/.test(company ?? '') ? 'channel_partner' : 'developer',
      team_size: Number(field('Sales team size')) || null, source: 'website', campaign: l.campaign_name ?? field('Request'),
      contact_name: l.name, contact_email: l.email, contact_phone: l.phone, notes, source_ref: `website-request:${l.id}`, created_by: actor.userId,
      created_at: l.created_at,
    })
    if (!e) imported++
  }
  await audit(db, actor, 'sales.website_requests_imported', 'integration_connections', connectionId, { imported })
  return { success: true as const, data: { imported } }
}

// ── Internal Support (staff side) ──────────────────────────────────────────────────────────────
export async function listCases(db: Db, actor: Actor, filter: { status?: string; mine?: boolean } = {}) {
  if (!can(actor.role, 'supportRead')) return fail('Not permitted.', 403)
  let q = db.from('support_cases').select('id, org_id, subject, category, priority, status, assignee_user_id, created_at, updated_at').order('updated_at', { ascending: false }).limit(300)
  if (filter.status === 'active') q = q.in('status', ['open', 'in_progress', 'waiting_on_customer'])
  else if (filter.status) q = q.eq('status', filter.status)
  if (filter.mine) q = q.eq('assignee_user_id', actor.userId)
  const { data, error } = await q
  if (error) return fail(error.message, 500)
  const orgIds = [...new Set((data ?? []).map((c) => c.org_id))]
  const { data: orgs } = orgIds.length ? await db.from('organisations').select('id, name').in('id', orgIds) : { data: [] }
  const name = new Map((orgs ?? []).map((o) => [o.id, o.name]))
  return { success: true as const, data: (data ?? []).map((c) => ({ ...c, org_name: name.get(c.org_id) ?? '—' })) }
}

export async function getCaseForStaff(db: Db, actor: Actor, id: string) {
  if (!can(actor.role, 'supportRead')) return fail('Not permitted.', 403)
  const { data: c } = await db.from('support_cases').select('*').eq('id', id).maybeSingle()
  if (!c) return fail('Case not found.', 404)
  const [{ data: messages }, { data: org }] = await Promise.all([
    db.from('support_case_messages').select('id, author_kind, author_label, body, internal, created_at').eq('case_id', id).order('created_at'),
    db.from('organisations').select('id, name, slug, type').eq('id', c.org_id).single(),
  ])
  return { success: true as const, data: { ...c, org, messages: messages ?? [] } }
}

export async function staffReply(db: Db, actor: Actor & { label: string }, id: string, body: string, internal: boolean) {
  if (!can(actor.role, 'supportWrite')) return fail('Not permitted.', 403)
  const { data: c } = await db.from('support_cases').select('id, status').eq('id', id).maybeSingle()
  if (!c) return fail('Case not found.', 404)
  if (c.status === 'closed') return fail('This case is closed.', 409)
  const { error } = await db.from('support_case_messages').insert({ case_id: id, author_kind: 'staff', author_user: actor.userId, author_label: `${actor.label} (REGrow support)`, body, internal })
  if (error) return fail('Could not save the reply.', 400)
  await db.from('support_cases').update({ updated_at: new Date().toISOString(), status: internal ? c.status : 'waiting_on_customer' }).eq('id', id)
  await audit(db, actor, internal ? 'support.case_note_added' : 'support.case_replied', 'support_cases', id)
  return { success: true as const, data: { id } }
}

export async function updateCase(db: Db, actor: Actor, id: string, change: { status?: string; priority?: string; assigneeUserId?: string | null }) {
  if (!can(actor.role, 'supportWrite')) return fail('Not permitted.', 403)
  const { data: c } = await db.from('support_cases').select('id').eq('id', id).maybeSingle()
  if (!c) return fail('Case not found.', 404)
  if (change.assigneeUserId) {
    const { data: t } = await db.from('platform_users').select('role').eq('user_id', change.assigneeUserId).eq('is_active', true).maybeSingle()
    if (!t || !['support_agent', 'platform_admin', 'super_admin'].includes(t.role)) return fail('Cases can only be assigned to support staff.', 400)
  }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (change.status) { patch.status = change.status; if (change.status === 'resolved') patch.resolved_at = new Date().toISOString() }
  if (change.priority) patch.priority = change.priority
  if (change.assigneeUserId !== undefined) patch.assignee_user_id = change.assigneeUserId
  const { error } = await db.from('support_cases').update(patch).eq('id', id)
  if (error) return fail('Invalid change.', 400)
  await audit(db, actor, 'support.case_updated', 'support_cases', id, change)
  return { success: true as const, data: { id } }
}

// ── Customer side of support (Help page in the workspace) ──────────────────────────────────────
const SEE_ALL_CASES = ['owner', 'admin']

export async function listOrgCases(db: Db, orgId: string, member: { profileId: string; role: string }) {
  let q = db.from('support_cases').select('id, subject, category, priority, status, created_at, updated_at, opened_by_profile').eq('org_id', orgId).order('updated_at', { ascending: false })
  if (!SEE_ALL_CASES.includes(member.role)) q = q.eq('opened_by_profile', member.profileId)
  const { data } = await q
  return data ?? []
}

export async function getOrgCase(db: Db, orgId: string, member: { profileId: string; role: string }, id: string) {
  const { data: c } = await db.from('support_cases').select('id, subject, category, priority, status, created_at, opened_by_profile').eq('id', id).eq('org_id', orgId).maybeSingle()
  if (!c || (!SEE_ALL_CASES.includes(member.role) && c.opened_by_profile !== member.profileId)) return null
  // Internal staff notes are never returned to the customer.
  const { data: messages } = await db.from('support_case_messages').select('id, author_kind, author_label, body, created_at').eq('case_id', id).eq('internal', false).order('created_at')
  return { ...c, messages: messages ?? [] }
}

export async function openCase(db: Db, orgId: string, member: { profileId: string; userId: string; label: string }, input: { subject: string; category: string; body: string; priority?: string }) {
  const { data, error } = await db.from('support_cases').insert({ org_id: orgId, opened_by_profile: member.profileId, subject: input.subject, category: input.category, priority: input.priority === 'urgent' || input.priority === 'high' ? input.priority : 'normal' }).select('id').single()
  if (error) return fail('Some details are not valid.', 400)
  await db.from('support_case_messages').insert({ case_id: data.id, author_kind: 'customer', author_user: member.userId, author_label: member.label, body: input.body })
  await db.from('org_audit_logs').insert({ org_id: orgId, actor_kind: 'member', actor_user_id: member.userId, actor_profile_id: member.profileId, actor_label: member.label, action: 'support.case_opened', target_type: 'support_cases', target_id: data.id, metadata: { subject: input.subject } })
  return { success: true as const, data: { id: data.id as string } }
}

export async function customerReply(db: Db, orgId: string, member: { profileId: string; userId: string; role: string; label: string }, id: string, body: string) {
  const c = await getOrgCase(db, orgId, member, id)
  if (!c) return fail('Case not found.', 404)
  if (c.status === 'closed') return fail('This case is closed. Please open a new one.', 409)
  const { error } = await db.from('support_case_messages').insert({ case_id: id, author_kind: 'customer', author_user: member.userId, author_label: member.label, body })
  if (error) return fail('Could not send the message.', 400)
  await db.from('support_cases').update({ status: c.status === 'resolved' || c.status === 'waiting_on_customer' ? 'open' : c.status, updated_at: new Date().toISOString() }).eq('id', id)
  return { success: true as const, data: { id } }
}

// ── Staff accounts (Platform Owner only) ───────────────────────────────────────────────────────
export async function listStaff(db: Db, actor: Actor) {
  if (!can(actor.role, 'staff')) return fail('Not permitted.', 403)
  const { data } = await db.from('platform_users').select('id, user_id, role, is_active, created_at, updated_at').order('created_at')
  const out = []
  for (const s of data ?? []) {
    const { data: u } = await db.auth.admin.getUserById(s.user_id)
    out.push({ ...s, email: u?.user?.email ?? '—', mfa: (u?.user?.factors ?? []).some((f: { status: string }) => f.status === 'verified') })
  }
  return { success: true as const, data: out }
}

/**
 * Give an existing REGrow account a staff role. Accounts are never created here: the person signs up or is invited
 * first, and must enrol an authenticator app before any console page opens (AAL2). Production staff accounts are
 * added only with the founder's approval (docs/design/internal-portal.md §5).
 */
export async function addStaff(db: Db, actor: Actor, email: string, role: StaffRole) {
  if (!can(actor.role, 'staff')) return fail('Not permitted.', 403)
  const target = await findUserByEmail(db, email)
  if (!target) return fail('No REGrow account uses that email. Ask the person to create an account first.', 404)
  const { data: existing } = await db.from('platform_users').select('id').eq('user_id', target).maybeSingle()
  if (existing) return fail('This person is already on the staff list; change their role instead.', 409)
  const { data, error } = await db.from('platform_users').insert({ user_id: target, role, is_active: true, mfa_enforced: true }).select('id').single()
  if (error) return fail(error.message, 400)
  await audit(db, actor, 'staff.added', 'platform_users', data.id, { email, role })
  return { success: true as const, data: { id: data.id as string } }
}

export async function changeStaff(db: Db, actor: Actor, platformUserId: string, change: { role?: StaffRole; active?: boolean }) {
  if (!can(actor.role, 'staff')) return fail('Not permitted.', 403)
  const { data: s } = await db.from('platform_users').select('id, user_id, role, is_active').eq('id', platformUserId).maybeSingle()
  if (!s) return fail('Staff member not found.', 404)
  if (s.user_id === actor.userId) return fail('You cannot change your own access.', 403)
  const losingOwner = s.role === 'super_admin' && s.is_active && ((change.role && change.role !== 'super_admin') || change.active === false)
  if (losingOwner) {
    const { count } = await db.from('platform_users').select('id', { count: 'exact', head: true }).eq('role', 'super_admin').eq('is_active', true)
    if ((count ?? 0) <= 1) return fail('There must always be at least one active Platform Owner.', 409)
  }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (change.role) patch.role = change.role
  if (change.active !== undefined) patch.is_active = change.active
  const { error } = await db.from('platform_users').update(patch).eq('id', s.id)
  if (error) return fail(error.message, 400)
  await audit(db, actor, change.active === false ? 'staff.deactivated' : change.active === true ? 'staff.reactivated' : 'staff.role_changed', 'platform_users', s.id, { from: s.role, ...change })
  return { success: true as const, data: { id: s.id } }
}

async function findUserByEmail(db: Db, email: string): Promise<string | null> {
  const { data, error } = await db.rpc('platform_account_id_by_email', { p_email: email })
  if (error) throw new Error(`account lookup failed: ${error.message}`)
  return (data as string | null) ?? null
}
