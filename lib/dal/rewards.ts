// lib/dal/rewards.ts — rewards (20260100; rules in lib/rewards/rules.ts). Programmes are written here after the API has
// checked the person; winners are found by the database (reward_qualify, hourly and on demand) and claims move only
// through set_reward_claim_status. Every query is scoped by organisation.
import { createServiceClient } from '@/lib/supabase/server'
import type { ClaimStatus, ProgramInput, RewardMetric, RewardType } from '@/lib/rewards/rules'

// The reward tables are not in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as unknown as { from: (t: string) => any; rpc: (f: string, a: Record<string, unknown>) => any }

export interface ProgramView extends ProgramInput {
  id: string; status: 'draft' | 'active' | 'closed' | 'cancelled'; createdAt: string
  claims: number; standing: number
}
export interface ClaimView {
  id: string; programId: string; programTitle: string; rewardDetail: string; profileId: string | null; teamId: string | null; name: string
  achieved: number; place: number | null; status: ClaimStatus; note: string | null; createdAt: string; decidedAt: string | null
  fulfilledAt: string | null; redeemedAt: string | null
}
export interface Standing { profileId: string | null; teamId: string | null; name: string; achieved: number }

const toProgram = (r: Record<string, unknown>, counts: Map<string, { all: number; standing: number }>): ProgramView => ({
  id: r.id as string, title: r.title as string, description: (r.description as string | null) ?? null, rewardType: r.reward_type as RewardType,
  rewardDetail: r.reward_detail as string, unitValue: Number(r.unit_value), budget: r.budget === null ? null : Number(r.budget),
  scope: r.scope as 'person' | 'team', eligibleRoles: r.eligible_roles as string[], eligibleTeamIds: r.eligible_team_ids as string[],
  goalKind: r.goal_kind as 'reach' | 'top', metric: r.metric as RewardMetric, goalAmount: r.goal_amount === null ? null : Number(r.goal_amount),
  topN: (r.top_n as number | null) ?? null, maxWinners: (r.max_winners as number | null) ?? null, startsOn: r.starts_on as string, endsOn: r.ends_on as string,
  status: r.status as ProgramView['status'], createdAt: r.created_at as string,
  claims: counts.get(r.id as string)?.all ?? 0, standing: counts.get(r.id as string)?.standing ?? 0,
})

export async function listPrograms(orgId: string): Promise<ProgramView[]> {
  const [{ data: programs }, { data: claims }] = await Promise.all([
    db().from('reward_programs').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(200),
    db().from('reward_claims').select('program_id, status').eq('org_id', orgId),
  ])
  const counts = new Map<string, { all: number; standing: number }>()
  for (const c of (claims ?? []) as { program_id: string; status: string }[]) {
    const x = counts.get(c.program_id) ?? { all: 0, standing: 0 }
    x.all++; if (c.status !== 'rejected') x.standing++
    counts.set(c.program_id, x)
  }
  return ((programs ?? []) as Record<string, unknown>[]).map((r) => toProgram(r, counts))
}

export async function getProgram(orgId: string, id: string): Promise<ProgramView | null> {
  const { data } = await db().from('reward_programs').select('*').eq('org_id', orgId).eq('id', id).maybeSingle()
  return data ? toProgram(data, new Map()) : null
}

/** Everyone eligible and their progress, best first (from the ledger). */
export async function standings(programId: string): Promise<Standing[]> {
  const { data } = await db().rpc('reward_standings', { p_program: programId })
  return ((data ?? []) as { profile_id: string | null; team_id: string | null; name: string; achieved: number | string }[])
    .map((s) => ({ profileId: s.profile_id, teamId: s.team_id, name: s.name, achieved: Number(s.achieved) }))
    .sort((a, b) => b.achieved - a.achieved || a.name.localeCompare(b.name))
}

export async function listClaims(orgId: string, opts: { profileId?: string; teamIds?: string[] } = {}): Promise<ClaimView[]> {
  let q = db().from('reward_claims').select('id, program_id, profile_id, team_id, name, achieved, place, status, note, created_at, decided_at, fulfilled_at, redeemed_at, reward_programs!inner(title, reward_detail)')
    .eq('org_id', orgId).order('created_at', { ascending: false }).limit(300)
  if (opts.profileId) {
    const teams = (opts.teamIds ?? []).filter((t) => /^[0-9a-f-]{36}$/i.test(t))
    q = teams.length ? q.or(`profile_id.eq.${opts.profileId},team_id.in.(${teams.join(',')})`) : q.eq('profile_id', opts.profileId)
  }
  const { data } = await q
  return ((data ?? []) as Record<string, unknown>[]).map((c) => ({
    id: c.id as string, programId: c.program_id as string, programTitle: (c.reward_programs as { title: string }).title,
    rewardDetail: (c.reward_programs as { reward_detail: string }).reward_detail, profileId: (c.profile_id as string | null) ?? null,
    teamId: (c.team_id as string | null) ?? null, name: c.name as string, achieved: Number(c.achieved), place: (c.place as number | null) ?? null,
    status: c.status as ClaimStatus, note: (c.note as string | null) ?? null, createdAt: c.created_at as string,
    decidedAt: (c.decided_at as string | null) ?? null, fulfilledAt: (c.fulfilled_at as string | null) ?? null, redeemedAt: (c.redeemed_at as string | null) ?? null,
  }))
}

export async function getClaim(orgId: string, id: string): Promise<{ id: string; profileId: string | null; teamId: string | null; status: ClaimStatus; programId: string } | null> {
  const { data } = await db().from('reward_claims').select('id, profile_id, team_id, status, program_id').eq('org_id', orgId).eq('id', id).maybeSingle()
  return data ? { id: data.id, profileId: data.profile_id, teamId: data.team_id, status: data.status, programId: data.program_id } : null
}

const row = (orgId: string, v: ProgramInput) => ({
  org_id: orgId, title: v.title, description: v.description, reward_type: v.rewardType, reward_detail: v.rewardDetail, unit_value: v.unitValue,
  budget: v.budget, scope: v.scope, eligible_roles: v.eligibleRoles, eligible_team_ids: v.eligibleTeamIds, goal_kind: v.goalKind, metric: v.metric,
  goal_amount: v.goalAmount, top_n: v.topN, max_winners: v.maxWinners, starts_on: v.startsOn, ends_on: v.endsOn,
})

/** Creates or changes a programme, then looks for winners at once. */
export async function saveProgram(orgId: string, id: string | null, v: ProgramInput, by: string):
  Promise<{ ok: true; id: string; winners: number } | { ok: false; status: number; error: string }> {
  const res = id
    ? await db().from('reward_programs').update(row(orgId, v)).eq('org_id', orgId).eq('id', id).in('status', ['draft', 'active']).select('id').maybeSingle()
    : await db().from('reward_programs').insert({ ...row(orgId, v), created_by: by }).select('id').single()
  if (res.error) {
    const msg = String(res.error.message ?? '')
    if (msg.includes('cannot change')) return { ok: false, status: 409, error: 'Someone has already won this programme, so its goal, dates and who can win are fixed. You can still change the name, description and reward.' }
    if (msg.includes('must belong')) return { ok: false, status: 400, error: 'Choose teams from this workspace.' }
    return { ok: false, status: 400, error: 'The programme could not be saved.' }
  }
  if (!res.data) return { ok: false, status: 404, error: 'Programme not found, or it has ended.' }
  const { data: n } = await db().rpc('reward_qualify', { p_program: res.data.id })
  return { ok: true, id: res.data.id, winners: Number(n ?? 0) }
}

export async function cancelProgram(orgId: string, id: string): Promise<boolean> {
  const { data } = await db().from('reward_programs').update({ status: 'cancelled' }).eq('org_id', orgId).eq('id', id).in('status', ['draft', 'active']).select('id').maybeSingle()
  return !!data
}

export async function qualifyNow(programId: string): Promise<number> {
  const { data } = await db().rpc('reward_qualify', { p_program: programId })
  return Number(data ?? 0)
}

export async function stepClaim(orgId: string, claimId: string, to: string, by: string, note: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await db().rpc('set_reward_claim_status', { p_org: orgId, p_claim: claimId, p_to: to, p_by: by, p_note: note })
  if (error) return { ok: false, error: String(error.message).includes('invalid_step') ? 'That step is not possible from where this reward is now.' : 'The reward could not be updated.' }
  return { ok: true }
}
