// lib/billing/access.ts — who may manage billing. Owners and admins; and, while a workspace is read-only only
// because its trial or paid period ended (billing hold, migration 20260059), the members whose real role is
// owner or admin, so that they can pay and lift the hold. A suspension by RE by PX staff never grants this.
import { NextResponse } from 'next/server'
import { authenticateCaller, type AuthContext } from '@/lib/auth/tenant'
import { createServiceClient } from '@/lib/supabase/server'
import type { MemberRole } from '@/types/database'

const BILLING_ROLES: MemberRole[] = ['owner', 'admin']

/** Pure rule, shared by pages and the API. */
export function billingRoleOf(m: { role: MemberRole; status: string; lifecycle_saved_role?: MemberRole | null }, billingHold: boolean): MemberRole | null {
  if (m.status !== 'active') return null
  if (BILLING_ROLES.includes(m.role)) return m.role
  if (billingHold && m.lifecycle_saved_role && BILLING_ROLES.includes(m.lifecycle_saved_role)) return m.lifecycle_saved_role
  return null
}

/** The caller's billing role in this organisation, or null. Server-only. */
export async function billingRoleFor(orgId: string, profileId: string): Promise<MemberRole | null> {
  const db = createServiceClient() as unknown as { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
  const [{ data: m }, { data: org }] = await Promise.all([
    db.from('org_members').select('role, status, lifecycle_saved_role').eq('org_id', orgId).eq('profile_id', profileId).maybeSingle(),
    db.from('organisations').select('billing_hold').eq('id', orgId).maybeSingle(),
  ])
  if (!m) return null
  return billingRoleOf(m, !!org?.billing_hold)
}

export async function authorizeBillingAccess(orgId: string): Promise<
  | { success: true; context: AuthContext & { orgId: string; role: MemberRole } }
  | { success: false; response: NextResponse }
> {
  const authRes = await authenticateCaller()
  if (!authRes.success) return authRes
  const role = await billingRoleFor(orgId, authRes.auth.profile.id)
  if (!role) return { success: false, response: NextResponse.json({ error: 'Only owners and admins can manage billing.' }, { status: 403 }) }
  return { success: true, context: { ...authRes.auth, orgId, role } }
}

/** For the workspace banner: is this read-only state a billing hold, and can this person pay to lift it? */
export async function billingHoldStatus(orgId: string, profileId: string): Promise<{ hold: boolean; canPay: boolean }> {
  const db = createServiceClient() as unknown as { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: org } = await db.from('organisations').select('billing_hold').eq('id', orgId).maybeSingle()
  if (!org?.billing_hold) return { hold: false, canPay: false }
  return { hold: true, canPay: !!(await billingRoleFor(orgId, profileId)) }
}
