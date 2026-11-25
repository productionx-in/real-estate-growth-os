// lib/sales/structure.ts — how a workspace's sales are organised (org_settings.sales, 20260096). Pure, so the settings
// page, the API, the performance pages and the tests share one definition.
//   ownerSells:   the owner also works as a salesperson — receives leads (routing and manual assignment), has a
//                 personal "My performance" page and appears on the leaderboard. Off: the owner only manages.
//                 The database enforces it too (member_can_take_leads), so no path can give an owner leads while off.
//   teamsEnabled: team structure — teams with a leader and projects, team performance, leaderboards and achievements.
import type { MemberRole } from '@/types/database'

export interface SalesStructure { ownerSells: boolean; teamsEnabled: boolean }

/** A workspace with nothing stored keeps the behaviour it had before this setting existed (the database agrees). */
export const STORED_DEFAULT: SalesStructure = { ownerSells: true, teamsEnabled: false }
/** What a newly created workspace starts with: the owner manages, no teams until they are wanted. */
export const NEW_WORKSPACE: SalesStructure = { ownerSells: false, teamsEnabled: false }

export function salesFromStored(v: unknown): SalesStructure {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  return {
    ownerSells: typeof o.ownerSells === 'boolean' ? o.ownerSells : STORED_DEFAULT.ownerSells,
    teamsEnabled: typeof o.teamsEnabled === 'boolean' ? o.teamsEnabled : STORED_DEFAULT.teamsEnabled,
  }
}

/** Mirrors public.member_can_take_leads: may this member be given leads? */
export function canTakeLeads(role: MemberRole | null | undefined, s: SalesStructure): boolean {
  if (!role || role === 'readonly' || role === 'post_sales') return false
  return role !== 'owner' || s.ownerSells
}

/** Does this person have a personal sales page (My performance) and a place on the leaderboard? */
export function sellsPersonally(role: MemberRole | null | undefined, s: SalesStructure): boolean {
  return canTakeLeads(role, s)
}

/** Owners, admins and managers watch the whole team; team leads their team. */
export function watchesTeam(role: MemberRole | null | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'manager' || role === 'team_lead'
}
