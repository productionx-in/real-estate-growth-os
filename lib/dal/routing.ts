// lib/dal/routing.ts
// Data access for teams, team membership, routing rules and on-duty status (REGrow Lead Engine, M1).
// Every query is scoped by orgId; the database additionally enforces same-organisation integrity
// (enforce_routing_tenant_integrity) and active-membership rules, so a wrong id can never cross tenants.
import { createServiceClient } from '@/lib/supabase/server'
import type {
  TeamCreateInput, TeamUpdateInput, TeamMemberUpsertInput, RuleCreateInput, RuleUpdateInput,
} from '@/lib/validations/routing'
import type { Database } from '@/types/database'

type Tables = Database['public']['Tables']
type TeamUpdate = Tables['teams']['Update']
type RuleUpdate = Tables['routing_rules']['Update']
type RuleInsert = Tables['routing_rules']['Insert']

export type DalResult<T> = { success: true; data: T } | { success: false; error: string; status: number }

/** Map database errors to safe client messages. Integrity trigger messages never contain foreign ids. */
function fail(error: { code?: string; message?: string } | null, fallback: string): { success: false; error: string; status: number } {
  const message = error?.message ?? fallback
  if (error?.code === '23505') return { success: false, error: 'A record with this name already exists', status: 409 }
  if (/routing_integrity|not an active member|readonly/i.test(message)) return { success: false, error: message, status: 400 }
  if (error?.code === '23503') return { success: false, error: 'Referenced record is in use or does not exist', status: 409 }
  return { success: false, error: fallback, status: 500 }
}

// ---------------------------------------------------------------- teams
export async function listTeams(orgId: string) {
  const service = createServiceClient()
  const { data, error } = await service
    .from('teams')
    .select('id, name, description, timezone, is_active, created_at, team_members(id, profile_id, weight, daily_capacity, is_on_duty, last_assigned_at, profile:profiles(id, full_name))')
    .eq('org_id', orgId)
    .order('name')
  if (error) return fail(error, 'Failed to load teams')
  return { success: true as const, data }
}

export async function createTeam(input: TeamCreateInput): Promise<DalResult<{ id: string }>> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('teams')
    .insert({ org_id: input.orgId, name: input.name, description: input.description ?? null, timezone: input.timezone })
    .select('id')
    .single()
  if (error || !data) return fail(error, 'Failed to create team')
  return { success: true, data }
}

export async function updateTeam(teamId: string, input: TeamUpdateInput): Promise<DalResult<{ id: string }>> {
  const service = createServiceClient()
  const patch: TeamUpdate = {}
  if (input.name !== undefined) patch.name = input.name
  if (input.description !== undefined) patch.description = input.description
  if (input.timezone !== undefined) patch.timezone = input.timezone
  if (input.isActive !== undefined) patch.is_active = input.isActive
  const { data, error } = await service.from('teams').update(patch).eq('id', teamId).eq('org_id', input.orgId).select('id').maybeSingle()
  if (error) return fail(error, 'Failed to update team')
  if (!data) return { success: false, error: 'Team not found', status: 404 }
  return { success: true, data }
}

export async function deleteTeam(orgId: string, teamId: string): Promise<DalResult<{ id: string }>> {
  const service = createServiceClient()
  const { data, error } = await service.from('teams').delete().eq('id', teamId).eq('org_id', orgId).select('id').maybeSingle()
  if (error) return fail(error, 'Failed to delete team') // 23503 when a routing rule still targets this team
  if (!data) return { success: false, error: 'Team not found', status: 404 }
  return { success: true, data }
}

// ---------------------------------------------------------------- team members
export async function upsertTeamMember(teamId: string, input: TeamMemberUpsertInput): Promise<DalResult<{ id: string }>> {
  const service = createServiceClient()
  const { data, error } = await service
    .from('team_members')
    .upsert({
      org_id: input.orgId, team_id: teamId, profile_id: input.profileId,
      weight: input.weight, daily_capacity: input.dailyCapacity, is_on_duty: input.isOnDuty,
    }, { onConflict: 'team_id,profile_id' })
    .select('id')
    .single()
  if (error || !data) return fail(error, 'Failed to save team member')
  return { success: true, data }
}

export async function removeTeamMember(orgId: string, teamId: string, profileId: string): Promise<DalResult<{ id: string }>> {
  const service = createServiceClient()
  const { data, error } = await service.from('team_members').delete()
    .eq('org_id', orgId).eq('team_id', teamId).eq('profile_id', profileId).select('id').maybeSingle()
  if (error) return fail(error, 'Failed to remove team member')
  if (!data) return { success: false, error: 'Team member not found', status: 404 }
  return { success: true, data }
}

/** A salesperson switches themselves on/off duty across all their teams in the organisation. */
export async function setOwnDutyStatus(orgId: string, profileId: string, isOnDuty: boolean): Promise<DalResult<{ updated: number }>> {
  const service = createServiceClient()
  const { data, error } = await service.from('team_members').update({ is_on_duty: isOnDuty })
    .eq('org_id', orgId).eq('profile_id', profileId).select('id')
  if (error) return fail(error, 'Failed to update duty status')
  return { success: true, data: { updated: data?.length ?? 0 } }
}

// ---------------------------------------------------------------- rules
function ruleRow(input: Partial<RuleCreateInput>): RuleUpdate {
  const row: RuleUpdate = {}
  if (input.name !== undefined) row.name = input.name
  if (input.priority !== undefined) row.priority = input.priority
  if (input.teamId !== undefined) row.team_id = input.teamId
  if (input.strategy !== undefined) row.strategy = input.strategy
  if (input.stickyDays !== undefined) row.sticky_days = input.stickyDays
  if (input.isActive !== undefined) row.is_active = input.isActive
  if (input.matchProjectIds !== undefined) row.match_project_ids = input.matchProjectIds
  if (input.matchSources !== undefined) row.match_sources = input.matchSources
  if (input.matchConnectionIds !== undefined) row.match_connection_ids = input.matchConnectionIds
  if (input.matchCampaignIds !== undefined) row.match_campaign_ids = input.matchCampaignIds
  if (input.matchFormIds !== undefined) row.match_form_ids = input.matchFormIds
  return row
}

export async function listRules(orgId: string) {
  const service = createServiceClient()
  const { data, error } = await service.from('routing_rules').select('*, team:teams(id, name)')
    .eq('org_id', orgId).order('priority').order('created_at')
  if (error) return fail(error, 'Failed to load routing rules')
  return { success: true as const, data }
}

export async function createRule(input: RuleCreateInput): Promise<DalResult<{ id: string }>> {
  const service = createServiceClient()
  const row: RuleInsert = { ...ruleRow(input), org_id: input.orgId, name: input.name, team_id: input.teamId }
  const { data, error } = await service.from('routing_rules').insert(row).select('id').single()
  if (error || !data) return fail(error, 'Failed to create routing rule')
  return { success: true, data }
}

export async function updateRule(ruleId: string, input: RuleUpdateInput): Promise<DalResult<{ id: string }>> {
  const service = createServiceClient()
  const { data, error } = await service.from('routing_rules').update(ruleRow(input))
    .eq('id', ruleId).eq('org_id', input.orgId).select('id').maybeSingle()
  if (error) return fail(error, 'Failed to update routing rule')
  if (!data) return { success: false, error: 'Routing rule not found', status: 404 }
  return { success: true, data }
}

export async function deleteRule(orgId: string, ruleId: string): Promise<DalResult<{ id: string }>> {
  const service = createServiceClient()
  const { data, error } = await service.from('routing_rules').delete().eq('id', ruleId).eq('org_id', orgId).select('id').maybeSingle()
  if (error) return fail(error, 'Failed to delete routing rule')
  if (!data) return { success: false, error: 'Routing rule not found', status: 404 }
  return { success: true, data }
}

// ---------------------------------------------------------------- decisions
export async function listLeadRoutingDecisions(orgId: string, leadId: string) {
  const service = createServiceClient()
  const { data, error } = await service.from('lead_routing_decisions')
    .select('id, decided_at, outcome, assigned_to, strategy, detail, rule:routing_rules(id, name), team:teams(id, name)')
    .eq('org_id', orgId).eq('lead_id', leadId).order('decided_at', { ascending: false })
  if (error) return fail(error, 'Failed to load routing history')
  return { success: true as const, data }
}

/** Most recent routing decisions for the organisation (settings screen "Recent activity"). */
export async function listRecentRoutingDecisions(orgId: string, limit = 25) {
  const service = createServiceClient()
  const { data, error } = await service.from('lead_routing_decisions')
    .select('id, lead_id, decided_at, outcome, assigned_to, strategy, detail, lead:leads(id, name), assignee:profiles!lead_routing_decisions_assigned_to_fkey(id, full_name)')
    .eq('org_id', orgId).order('decided_at', { ascending: false }).limit(limit)
  if (error) return fail(error, 'Failed to load routing activity')
  return { success: true as const, data }
}

/** Duty status of the caller across their teams: null when they belong to no team. */
export async function getOwnDutyStatus(orgId: string, profileId: string): Promise<DalResult<{ teams: number; onDuty: boolean | null }>> {
  const service = createServiceClient()
  const { data, error } = await service.from('team_members').select('is_on_duty, team:teams!inner(is_active)')
    .eq('org_id', orgId).eq('profile_id', profileId).eq('team.is_active', true)
  if (error) return fail(error, 'Failed to load duty status')
  const rows = data ?? []
  return { success: true, data: { teams: rows.length, onDuty: rows.length ? rows.some((r) => r.is_on_duty) : null } }
}
