// lib/dal/sales-structure.ts — read and save org_settings.sales (lib/sales/structure.ts, 20260096). Reads for anyone in
// the workspace; saving is owners and admins only (the API authorises).
import { createServiceClient } from '@/lib/supabase/server'
import { NEW_WORKSPACE, canTakeLeads, salesFromStored, type SalesStructure } from '@/lib/sales/structure'
import { ASSIGNABLE_ROLES } from '@/lib/auth/permissions'
import type { MemberRole } from '@/types/database'

// org_settings.sales is not in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (createServiceClient() as unknown as { from: (t: string) => any }).from('org_settings')

export async function getSalesStructure(orgId: string): Promise<SalesStructure> {
  const { data } = await table().select('sales').eq('org_id', orgId).maybeSingle()
  return salesFromStored(data?.sales)
}

export async function saveSalesStructure(orgId: string, actorId: string, s: SalesStructure): Promise<boolean> {
  const { error } = await table().upsert({ org_id: orgId, sales: s, updated_by: actorId, updated_at: new Date().toISOString() }, { onConflict: 'org_id' })
  return !error
}

/** A new workspace starts with the owner as manager only (called right after it is created). */
export async function initSalesStructure(orgId: string): Promise<void> {
  await table().upsert({ org_id: orgId, sales: NEW_WORKSPACE }, { onConflict: 'org_id', ignoreDuplicates: true })
}

/** Open leads an owner currently holds (shown when switching "owner sells" off, so they can be handed over). */
export async function openLeadsHeldByOwners(orgId: string): Promise<number> {
  const db = createServiceClient()
  const { data: owners } = await db.from('org_members').select('profile_id').eq('org_id', orgId).eq('role', 'owner').eq('status', 'active')
  const ids = (owners ?? []).map((o) => o.profile_id as string)
  if (!ids.length) return 0
  const { count } = await db.from('leads').select('id', { count: 'exact', head: true }).eq('org_id', orgId).in('assigned_to', ids).not('status', 'in', '(booked,lost,junk)')
  return count ?? 0
}

/** Roles that may be given leads in this workspace now (ASSIGNABLE_ROLES, minus the owner while ownerSells is off). */
export async function assignableRolesFor(orgId: string): Promise<MemberRole[]> {
  const s = await getSalesStructure(orgId)
  return ASSIGNABLE_ROLES.filter((r) => canTakeLeads(r, s))
}
