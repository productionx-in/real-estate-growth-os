// types/app.ts
// Application-level type aliases and helpers

import type {
  Database,
  MemberRole,
  LeadStatus,
  LeadSource,
  LeadPriority,
  ProjectStatus,
  ProjectType,
  OrgType,
} from './database'

// Row aliases
export type Organisation = Database['public']['Tables']['organisations']['Row']
export type Profile = Database['public']['Tables']['profiles']['Row']
export type OrgMember = Database['public']['Tables']['org_members']['Row']
export type Project = Database['public']['Tables']['projects']['Row']
export type Lead = Database['public']['Tables']['leads']['Row']
export type LeadActivity = Database['public']['Tables']['lead_activities']['Row']
export type LeadAssignment = Database['public']['Tables']['lead_assignments']['Row']

// Insert / Update aliases
export type InsertLead = Database['public']['Tables']['leads']['Insert']
export type UpdateLead = Database['public']['Tables']['leads']['Update']
export type InsertProject = Database['public']['Tables']['projects']['Insert']
export type UpdateProject = Database['public']['Tables']['projects']['Update']

// Composed types used in the UI
export type LeadWithRelations = Lead & {
  project: Pick<Project, 'id' | 'name' | 'slug'> | null
  assignee: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null
}

export type OrgMemberWithProfile = OrgMember & {
  profile: Profile
}

// JWT custom claims added by Supabase Auth hook
export interface AppJwtClaims {
  org_id: string
  org_slug: string
  app_role: MemberRole
}

// Re-export enum types for convenience
export type { MemberRole, LeadStatus, LeadSource, LeadPriority, ProjectStatus, ProjectType, OrgType }

// Permission helpers
export const MANAGER_ROLES: MemberRole[] = ['owner', 'admin', 'manager']
export const ADMIN_ROLES: MemberRole[] = ['owner', 'admin']

export function canManageLeads(role: MemberRole): boolean {
  return MANAGER_ROLES.includes(role)
}

export function canManageOrg(role: MemberRole): boolean {
  return ADMIN_ROLES.includes(role)
}

export function canDeleteLeads(role: MemberRole): boolean {
  return MANAGER_ROLES.includes(role)
}

export function canAssignLeads(role: MemberRole): boolean {
  return MANAGER_ROLES.includes(role)
}

export function canImportLeads(role: MemberRole): boolean {
  return MANAGER_ROLES.includes(role)
}
