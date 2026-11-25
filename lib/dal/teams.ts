// lib/dal/teams.ts — team structure (20260097, rules in lib/teams/structure.ts). Teams are the routing teams: saving a
// team here also sets who is in its routing pool (new members join on duty with the usual defaults; people removed
// leave the pool). Every query is scoped by organisation; the database checks the leader and projects again.
import { createServiceClient } from '@/lib/supabase/server'
import { performanceDb as pdb, tally } from '@/lib/dal/performance'
import { teamAchievements, teamTotals, type MemberTotals, type TeamInput, type TeamTotals } from '@/lib/teams/structure'
import type { MemberRole } from '@/types/database'

// teams.leader_profile_id / project_ids are not in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as unknown as { from: (t: string) => any }

export interface TeamView {
  id: string; name: string; description: string | null; isActive: boolean
  leader: { id: string; name: string } | null
  members: { id: string; name: string; role: MemberRole; onDuty: boolean }[]
  projects: { id: string; name: string }[]
}

export async function listTeamStructure(orgId: string): Promise<TeamView[]> {
  const [{ data: teams }, { data: members }, { data: projects }] = await Promise.all([
    db().from('teams').select('id, name, description, is_active, leader_profile_id, project_ids, leader:profiles!teams_leader_profile_id_fkey(full_name), team_members(profile_id, is_on_duty)').eq('org_id', orgId).order('name'),
    db().from('org_members').select('profile_id, role, profiles!org_members_profile_id_fkey(full_name)').eq('org_id', orgId).eq('status', 'active'),
    db().from('projects').select('id, name').eq('org_id', orgId),
  ])
  const who = new Map(((members ?? []) as { profile_id: string; role: MemberRole; profiles: { full_name: string | null } | null }[]).map((m) => [m.profile_id, { name: m.profiles?.full_name?.trim() || 'Team member', role: m.role }]))
  const proj = new Map(((projects ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]))
  return ((teams ?? []) as { id: string; name: string; description: string | null; is_active: boolean; leader_profile_id: string | null; project_ids: string[]; leader: { full_name: string | null } | null; team_members: { profile_id: string; is_on_duty: boolean }[] }[]).map((t) => ({
    id: t.id, name: t.name, description: t.description, isActive: t.is_active,
    leader: t.leader_profile_id ? { id: t.leader_profile_id, name: t.leader?.full_name?.trim() || who.get(t.leader_profile_id)?.name || 'Team member' } : null,
    members: t.team_members.filter((m) => who.has(m.profile_id)).map((m) => ({ id: m.profile_id, name: who.get(m.profile_id)!.name, role: who.get(m.profile_id)!.role, onDuty: m.is_on_duty }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    projects: (t.project_ids ?? []).filter((id) => proj.has(id)).map((id) => ({ id, name: proj.get(id)! })),
  }))
}

type Result = { ok: true; id: string } | { ok: false; error: string; status: number }
const failure = (e: { code?: string; message?: string } | null, fallback: string): Result => {
  const m = e?.message ?? ''
  if (e?.code === '23505') return { ok: false, error: 'A team with this name already exists.', status: 409 }
  if (/teams:|routing_integrity|not an active member|readonly|cannot be/i.test(m)) return { ok: false, error: m.replace(/^teams: /, '').replace(/^./, (c) => c.toUpperCase()), status: 400 }
  return { ok: false, error: fallback, status: 500 }
}

/** Creates or updates a team and makes its membership exactly `memberIds`. */
export async function saveTeam(orgId: string, teamId: string | null, v: TeamInput): Promise<Result> {
  const row = { name: v.name, description: v.description, leader_profile_id: v.leaderProfileId, project_ids: v.projectIds }
  let id = teamId
  if (id) {
    const { data, error } = await db().from('teams').update(row).eq('org_id', orgId).eq('id', id).select('id').maybeSingle()
    if (error) return failure(error, 'Could not save the team.')
    if (!data) return { ok: false, error: 'Team not found.', status: 404 }
  } else {
    const { data, error } = await db().from('teams').insert({ ...row, org_id: orgId }).select('id').single()
    if (error || !data) return failure(error, 'Could not create the team.')
    id = data.id as string
  }
  const { data: current } = await db().from('team_members').select('profile_id').eq('org_id', orgId).eq('team_id', id)
  const have = new Set(((current ?? []) as { profile_id: string }[]).map((m) => m.profile_id))
  const want = new Set(v.memberIds)
  const add = [...want].filter((p) => !have.has(p)), drop = [...have].filter((p) => !want.has(p))
  if (add.length) {
    const { error } = await db().from('team_members').insert(add.map((p) => ({ org_id: orgId, team_id: id, profile_id: p })))
    if (error) return failure(error, 'Could not add the team members.')
  }
  if (drop.length) {
    const { error } = await db().from('team_members').delete().eq('org_id', orgId).eq('team_id', id).in('profile_id', drop)
    if (error) return failure(error, 'Could not remove the team members.')
  }
  return { ok: true, id: id! }
}

export async function deleteTeamStructure(orgId: string, teamId: string): Promise<Result> {
  const { data, error } = await db().from('teams').delete().eq('org_id', orgId).eq('id', teamId).select('id').maybeSingle()
  if (error?.code === '23503') return { ok: false, error: 'A lead routing rule still sends leads to this team. Change the rule first, or switch the team off.', status: 409 }
  if (error) return failure(error, 'Could not delete the team.')
  if (!data) return { ok: false, error: 'Team not found.', status: 404 }
  return { ok: true, id: teamId }
}

/** Each team's numbers for a window and all time, from its current members' recorded work. */
export async function teamPerformance(orgId: string, teams: TeamView[], window: { from: Date; to: Date }): Promise<Map<string, { period: TeamTotals; allTime: TeamTotals; achievements: ReturnType<typeof teamAchievements> }>> {
  const ids = [...new Set(teams.flatMap((t) => t.members.map((m) => m.id)))]
  const out = new Map<string, { period: TeamTotals; allTime: TeamTotals; achievements: ReturnType<typeof teamAchievements> }>()
  if (!ids.length) {
    for (const t of teams) { const z = teamTotals([], new Map()); out.set(t.id, { period: z, allTime: z, achievements: teamAchievements(z) }) }
    return out
  }
  const read = async (from: Date | null, to: Date | null) => {
    const rows: Parameters<typeof tally>[0] = []
    for (let page = 0; page < 50; page++) {
      let q = pdb().from('performance_events').select('profile_id, kind, units, value, xp, occurred_at, detail').eq('org_id', orgId).in('profile_id', ids)
      if (from) q = q.gte('occurred_at', from.toISOString())
      if (to) q = q.lt('occurred_at', to.toISOString())
      const { data } = await q.order('occurred_at').range(page * 1000, page * 1000 + 999)
      rows.push(...((data ?? []) as Parameters<typeof tally>[0]))
      if ((data ?? []).length < 1000) break
    }
    return tally(rows) as unknown as Map<string, Partial<MemberTotals>>
  }
  const [inWindow, all] = await Promise.all([read(window.from, window.to), read(null, null)])
  for (const t of teams) {
    const m = t.members.map((x) => x.id)
    const allTime = teamTotals(m, all)
    out.set(t.id, { period: teamTotals(m, inWindow), allTime, achievements: teamAchievements(allTime) })
  }
  return out
}
