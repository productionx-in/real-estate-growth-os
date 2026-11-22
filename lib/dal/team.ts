// lib/dal/team.ts — team screens: when each member last signed in, monthly targets and progress. Callers authorise
// first (owners, admins and managers for targets; anyone who may see the team page for sign-in times). Every query
// is scoped by organisation.
import { createServiceClient } from '@/lib/supabase/server'
import { monthRange, nextMonthKey, type Progress, type Targets } from '@/lib/team/targets'

// member_targets is not in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as unknown as { from: (t: string) => any }

/** E-mail and last sign-in for each auth user, looked up one by one (never listing every account on the platform). */
export async function authDetails(authUserIds: string[]): Promise<Map<string, { email: string | null; lastSignInAt: string | null }>> {
  const admin = createServiceClient().auth.admin
  const out = new Map<string, { email: string | null; lastSignInAt: string | null }>()
  await Promise.all([...new Set(authUserIds)].slice(0, 500).map(async (id) => {
    const { data } = await admin.getUserById(id)
    if (data?.user) out.set(id, { email: data.user.email ?? null, lastSignInAt: data.user.last_sign_in_at ?? null })
  }))
  return out
}

export async function listTargets(orgId: string, month: string): Promise<Map<string, Targets>> {
  const { data } = await db().from('member_targets').select('profile_id, site_visits, bookings, booking_value').eq('org_id', orgId).eq('month', month)
  return new Map(((data ?? []) as { profile_id: string; site_visits: number | null; bookings: number | null; booking_value: number | string | null }[])
    .map((r) => [r.profile_id, { siteVisits: r.site_visits, bookings: r.bookings, bookingValue: r.booking_value === null ? null : Number(r.booking_value) }]))
}

/** Saves one person's targets for a month; all blank removes them. The database checks membership. */
export async function saveTargets(orgId: string, profileId: string, month: string, t: Targets, actorId: string): Promise<boolean> {
  if (t.siteVisits === null && t.bookings === null && t.bookingValue === null) {
    const { error } = await db().from('member_targets').delete().eq('org_id', orgId).eq('profile_id', profileId).eq('month', month)
    return !error
  }
  const { error } = await db().from('member_targets').upsert({
    org_id: orgId, profile_id: profileId, month, site_visits: t.siteVisits, bookings: t.bookings, booking_value: t.bookingValue,
    updated_by: actorId, updated_at: new Date().toISOString(),
  }, { onConflict: 'org_id,profile_id,month' })
  return !error
}

/**
 * Each person's month so far: site visits they completed, and bookings (not cancelled) on leads assigned to them,
 * with their value. Bookings count for whoever owns the lead.
 */
export async function monthProgress(orgId: string, month: string): Promise<Map<string, Progress>> {
  const { from, to } = monthRange(month)
  const s = createServiceClient()
  const [{ data: visits }, { data: bookings }] = await Promise.all([
    s.from('site_visits').select('assigned_to, completed_at, scheduled_at').eq('org_id', orgId).eq('status', 'completed')
      .gte('scheduled_at', new Date(from.getTime() - 31 * 86_400_000).toISOString()).lt('scheduled_at', to.toISOString()).limit(20000),
    s.from('bookings').select('total_amount, booking_date, status, lead:leads!inner(assigned_to)').eq('org_id', orgId).neq('status', 'cancelled')
      .gte('booking_date', month).lt('booking_date', nextMonthKey(month)).limit(20000),
  ])
  const out = new Map<string, Progress>()
  const get = (id: string) => out.get(id) ?? (out.set(id, { siteVisits: 0, bookings: 0, bookingValue: 0 }), out.get(id)!)
  for (const v of visits ?? []) {
    const at = new Date(v.completed_at ?? v.scheduled_at)
    if (v.assigned_to && at >= from && at < to) get(v.assigned_to).siteVisits++
  }
  for (const b of (bookings ?? []) as unknown as { total_amount: number | string; lead: { assigned_to: string | null } | null }[]) {
    const owner = b.lead?.assigned_to
    if (!owner) continue
    const p = get(owner); p.bookings++; p.bookingValue += Number(b.total_amount ?? 0)
  }
  return out
}
