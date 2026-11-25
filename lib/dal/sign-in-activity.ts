// lib/dal/sign-in-activity.ts — sign-in activity of a workspace's members (20260090), for its owners and admins.
// Only people who are (or were) members of THIS workspace appear; the page authorises the admin first. Addresses are
// shown partly hidden (lib/auth/sign-in-display.ts).
import { createServiceClient } from '@/lib/supabase/server'
import { describeDevice, maskIp } from '@/lib/auth/sign-in-display'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as unknown as { from: (t: string) => any }

export interface SignInRow {
  id: string
  profileId: string
  name: string
  signedInAt: string
  lastSeenAt: string | null
  endedAt: string | null
  device: string
  ip: string
  secondStep: boolean
}

export interface Person { profileId: string; name: string; role: string; active: boolean }

export async function workspacePeople(orgId: string): Promise<(Person & { authUserId: string })[]> {
  const { data } = await db().from('org_members').select('profile_id, role, status, profile:profiles!org_members_profile_id_fkey(id, full_name, auth_user_id)').eq('org_id', orgId)
  return ((data ?? []) as { profile_id: string; role: string; status: string; profile: { full_name: string | null; auth_user_id: string | null } | null }[])
    .filter((m) => m.profile?.auth_user_id)
    .map((m) => ({ profileId: m.profile_id, name: m.profile?.full_name || 'Team member', role: m.role, active: m.status === 'active', authUserId: m.profile!.auth_user_id! }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Latest sign-ins of the workspace's people (optionally one person), newest first, within `days`. */
export async function listSignIns(orgId: string, opts: { profileId?: string | null; days?: number; limit?: number } = {}): Promise<{ people: Person[]; rows: SignInRow[] }> {
  const people = await workspacePeople(orgId)
  const chosen = opts.profileId ? people.filter((p) => p.profileId === opts.profileId) : people
  if (!chosen.length) return { people: people.map(({ authUserId: _a, ...p }) => p), rows: [] }
  const byAuth = new Map(chosen.map((p) => [p.authUserId, p]))
  const since = new Date(Date.now() - (opts.days ?? 90) * 86_400_000).toISOString()
  const { data } = await db().from('sign_in_events')
    .select('id, auth_user_id, signed_in_at, last_seen_at, ended_at, ip, user_agent, second_step')
    .in('auth_user_id', [...byAuth.keys()]).gte('signed_in_at', since)
    .order('signed_in_at', { ascending: false }).limit(Math.min(opts.limit ?? 300, 1000))
  const rows = ((data ?? []) as { id: string; auth_user_id: string; signed_in_at: string; last_seen_at: string | null; ended_at: string | null; ip: string | null; user_agent: string | null; second_step: boolean }[])
    .map((e) => {
      const p = byAuth.get(e.auth_user_id)!
      return {
        id: e.id, profileId: p.profileId, name: p.name, signedInAt: e.signed_in_at, lastSeenAt: e.last_seen_at, endedAt: e.ended_at,
        device: describeDevice(e.user_agent), ip: maskIp(e.ip), secondStep: e.second_step,
      }
    })
  return { people: people.map(({ authUserId: _a, ...p }) => p), rows }
}
