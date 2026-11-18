// lib/auth/permissions.ts
// Single source of truth for role- and membership-status-based permission rules.
// Deliberately dependency-free (no Next.js / Supabase imports) so the exact production rules
// can be unit-tested directly (tests/permissions.test.mjs).
import type { MemberRole } from '@/types/database'

/** Only an `active` membership grants access. `deactivated`, `suspended`, null or unknown values never do. */
export function isActiveMembership(status: string | null | undefined): boolean {
  return status === 'active'
}

/** Roles allowed to create or change sales records (site visits, deals, holds, bookings). */
export const SALES_WRITE_ROLES: readonly MemberRole[] = ['owner', 'admin', 'manager', 'team_lead', 'sales_exec', 'post_sales']

/**
 * Roles allowed to manage channel partners. Channel-partner records carry bank details, PAN/GST and
 * commission rates, so they are restricted to management roles.
 */
export const CHANNEL_PARTNER_ADMIN_ROLES: readonly MemberRole[] = ['owner', 'admin', 'manager']

export function canWriteSales(role: MemberRole | null | undefined): boolean {
  return !!role && SALES_WRITE_ROLES.includes(role)
}

export function canManageChannelPartners(role: MemberRole | null | undefined): boolean {
  return !!role && CHANNEL_PARTNER_ADMIN_ROLES.includes(role)
}

/** Roles allowed to configure lead routing (teams, rules, members' duty and capacity). */
export const ROUTING_ADMIN_ROLES: readonly MemberRole[] = ['owner', 'admin', 'manager']

export function canManageRouting(role: MemberRole | null | undefined): boolean {
  return !!role && ROUTING_ADMIN_ROLES.includes(role)
}

// ── Roles and lead visibility ─────────────────────────────────────────────────────────────────────
// Which leads a member may see is decided here and nowhere else. Server code asks `leadScopeOf(role)`
// (lists) or `canSeeLead(viewer, lead)` (one lead); it never tests for a particular role name, so a new
// role cannot slip past a check written as "restrict sales executives".

export const MEMBER_ROLES: readonly MemberRole[] = ['owner', 'admin', 'manager', 'team_lead', 'sales_exec', 'post_sales', 'readonly']

export const ROLE_LABELS: Record<MemberRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Sales manager',
  team_lead: 'Team lead',
  sales_exec: 'Sales executive',
  post_sales: 'Post-sales',
  readonly: 'Viewer',
}

/** One line per role, shown when inviting someone or changing a role. */
export const ROLE_DESCRIPTIONS: Record<MemberRole, string> = {
  owner: 'Everything, including billing and transferring ownership.',
  admin: 'Everything except ownership: settings, team, integrations, audit log.',
  manager: 'All leads and sales, routing, projects and inventory. No workspace settings.',
  team_lead: 'Their own leads and their team’s: can reassign within the team and coach on every lead.',
  sales_exec: 'Leads assigned to them: calls, follow-ups, site visits, WhatsApp.',
  post_sales: 'Booked customers only: documents, payments and handover. Never receives new leads.',
  readonly: 'Can look at leads, projects, inventory and reports. Cannot change anything.',
}

/**
 * all    — every lead in the organisation
 * team   — leads assigned to them or to anyone in a team they belong to
 * own    — leads assigned to them
 * booked — booked customers only
 */
export type LeadScope = 'all' | 'team' | 'own' | 'booked'

export function leadScopeOf(role: MemberRole | null | undefined): LeadScope {
  switch (role) {
    case 'owner': case 'admin': case 'manager': case 'readonly': return 'all'
    case 'team_lead': return 'team'
    case 'post_sales': return 'booked'
    default: return 'own' // sales_exec, and anything unknown: the narrowest scope
  }
}

/** Who is looking. `teamProfileIds` (a team lead's teammates, themselves included) only matters for scope "team". */
export interface LeadViewer {
  role: MemberRole
  profileId: string
  teamProfileIds?: readonly string[]
}

/** Can this member see this lead at all? Unassigned leads are visible to own/team scopes, as before. */
export function canSeeLead(viewer: LeadViewer, lead: { assigned_to: string | null; status: string }): boolean {
  switch (leadScopeOf(viewer.role)) {
    case 'all': return true
    case 'booked': return lead.status === 'booked'
    case 'team': return !lead.assigned_to || lead.assigned_to === viewer.profileId || (viewer.teamProfileIds ?? []).includes(lead.assigned_to)
    case 'own': return !lead.assigned_to || lead.assigned_to === viewer.profileId
  }
}

/**
 * Can this member work the lead (call, log outcomes, follow-ups, notes, documents)? Read-only never;
 * a sales executive only their own; a team lead their team's; post-sales booked customers; managers all.
 * Stricter than canSeeLead: an unassigned lead is worked by whoever picks it up through assignment.
 */
export function canWorkLead(viewer: LeadViewer, lead: { assigned_to: string | null; status: string }): boolean {
  if (!canWriteSales(viewer.role)) return false
  switch (leadScopeOf(viewer.role)) {
    case 'all': return true
    case 'booked': return lead.status === 'booked'
    case 'team': return lead.assigned_to === viewer.profileId || (!!lead.assigned_to && (viewer.teamProfileIds ?? []).includes(lead.assigned_to))
    case 'own': return lead.assigned_to === viewer.profileId
  }
}

/** Roles that may be given leads (by hand or by routing). Post-sales and viewers never are. */
export const ASSIGNABLE_ROLES: readonly MemberRole[] = ['owner', 'admin', 'manager', 'team_lead', 'sales_exec']

/** May assign or reassign leads. A team lead only within their team (checked by canAssignTo). */
export function canAssignLeads(role: MemberRole | null | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'manager' || role === 'team_lead'
}

/** May this member hand a lead to `assigneeId`? Managers: anyone assignable; team leads: their team (themselves included). */
export function canAssignTo(viewer: LeadViewer, assigneeId: string): boolean {
  if (!canAssignLeads(viewer.role)) return false
  if (viewer.role !== 'team_lead') return true
  return assigneeId === viewer.profileId || (viewer.teamProfileIds ?? []).includes(assigneeId)
}

/** Managers and above: whole-organisation views (routing, speed to lead, team analytics, import). */
export const MANAGEMENT_ROLES: readonly MemberRole[] = ['owner', 'admin', 'manager']
export const isManagement = (role: MemberRole | null | undefined) => !!role && MANAGEMENT_ROLES.includes(role)

/** May add leads by hand. Post-sales works customers who already booked; viewers change nothing. */
export const canCreateLeads = (role: MemberRole | null | undefined) => !!role && ASSIGNABLE_ROLES.includes(role)
