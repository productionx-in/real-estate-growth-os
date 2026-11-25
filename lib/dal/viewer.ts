// lib/dal/viewer.ts
// Builds the LeadViewer the visibility rules need (lib/auth/permissions.ts). Only a team lead needs a
// lookup: their "team" is everyone in an active routing team they belong to. Scoped by organisation.
import { createServiceClient } from '@/lib/supabase/server'
import type { LeadViewer } from '@/lib/auth/permissions'
import type { MemberRole } from '@/types/database'

/**
 * Profile ids of everyone sharing an active team with this member (including them): teams they are in, and teams they
 * lead (20260097 — a leader oversees the team without having to be in its routing pool). Mirrors auth_shares_team.
 */
export async function teamProfileIdsOf(orgId: string, profileId: string): Promise<string[]> {
  const db = createServiceClient()
  const [{ data: mine }, { data: led }] = await Promise.all([
    db.from('team_members').select('team_id, team:teams!inner(is_active)').eq('org_id', orgId).eq('profile_id', profileId).eq('team.is_active', true),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- leader_profile_id is not in the generated types yet
    (db as any).from('teams').select('id').eq('org_id', orgId).eq('leader_profile_id', profileId).eq('is_active', true),
  ])
  const teamIds = [...new Set([...(mine ?? []).map((r) => r.team_id as string), ...((led ?? []) as { id: string }[]).map((t) => t.id)])]
  if (!teamIds.length) return [profileId]
  const { data: mates } = await db.from('team_members').select('profile_id').eq('org_id', orgId).in('team_id', teamIds)
  return [...new Set([profileId, ...(mates ?? []).map((m) => m.profile_id as string)])]
}

export async function resolveLeadViewer(orgId: string, role: MemberRole, profileId: string): Promise<LeadViewer> {
  return role === 'team_lead'
    ? { role, profileId, teamProfileIds: await teamProfileIdsOf(orgId, profileId) }
    : { role, profileId }
}
