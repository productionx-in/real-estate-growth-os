// lib/dal/viewer.ts
// Builds the LeadViewer the visibility rules need (lib/auth/permissions.ts). Only a team lead needs a
// lookup: their "team" is everyone in an active routing team they belong to. Scoped by organisation.
import { createServiceClient } from '@/lib/supabase/server'
import type { LeadViewer } from '@/lib/auth/permissions'
import type { MemberRole } from '@/types/database'

/** Profile ids of everyone sharing an active team with this member (including them). */
export async function teamProfileIdsOf(orgId: string, profileId: string): Promise<string[]> {
  const db = createServiceClient()
  const { data: mine } = await db.from('team_members').select('team_id, team:teams!inner(is_active)')
    .eq('org_id', orgId).eq('profile_id', profileId).eq('team.is_active', true)
  const teamIds = (mine ?? []).map((r) => r.team_id as string)
  if (!teamIds.length) return [profileId]
  const { data: mates } = await db.from('team_members').select('profile_id').eq('org_id', orgId).in('team_id', teamIds)
  return [...new Set([profileId, ...(mates ?? []).map((m) => m.profile_id as string)])]
}

export async function resolveLeadViewer(orgId: string, role: MemberRole, profileId: string): Promise<LeadViewer> {
  return role === 'team_lead'
    ? { role, profileId, teamProfileIds: await teamProfileIdsOf(orgId, profileId) }
    : { role, profileId }
}
