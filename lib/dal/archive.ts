// lib/dal/archive.ts — the Archive (20260073): deleted leads kept for 30 days, then erased by a daily job. Callers
// authorise first (owners and admins). Every query is scoped by organisation; restoring and erasing go through
// SQL functions that re-check the organisation and that the lead really is archived.
import { createServiceClient } from '@/lib/supabase/server'

export const ARCHIVE_DAYS = 30

export interface ArchivedLead {
  id: string; name: string; phone: string | null; source: string | null; status: string
  deletedAt: string; deletedBy: string | null; expiresAt: string
  /** Whole days until the daily job erases it (0 = tonight). */
  daysLeft: number
}

// The archive lives in public.leads_all (public.leads is the view of live rows); it is not in the typed schema.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const untyped = () => createServiceClient() as unknown as { from: (t: string) => any; rpc: (f: string, a: Record<string, unknown>) => any }

export async function listArchivedLeads(orgId: string, limit = 200): Promise<ArchivedLead[]> {
  const { data } = await untyped().from('leads_all')
    .select('id, name, phone, source, status, deleted_at, deleter:profiles!leads_all_deleted_by_fkey(full_name)')
    .eq('org_id', orgId).not('deleted_at', 'is', null).order('deleted_at', { ascending: false }).limit(limit)
  return ((data ?? []) as { id: string; name: string; phone: string | null; source: string | null; status: string; deleted_at: string; deleter: { full_name: string } | null }[])
    .map((r) => {
      const expires = new Date(r.deleted_at).getTime() + ARCHIVE_DAYS * 86_400_000
      return {
        id: r.id, name: r.name, phone: r.phone, source: r.source, status: r.status, deletedAt: r.deleted_at, deletedBy: r.deleter?.full_name ?? null,
        expiresAt: new Date(expires).toISOString(), daysLeft: Math.max(0, Math.ceil((expires - Date.now()) / 86_400_000)),
      }
    })
}

export async function countArchivedLeads(orgId: string): Promise<number> {
  const { count } = await untyped().from('leads_all').select('id', { count: 'exact', head: true }).eq('org_id', orgId).not('deleted_at', 'is', null)
  return count ?? 0
}

export type ArchiveResult = { ok: true } | { ok: false; status: number; error: string }

export async function restoreLead(orgId: string, leadId: string): Promise<ArchiveResult> {
  const { data, error } = await untyped().rpc('restore_lead', { p_lead: leadId, p_org: orgId })
  if (error?.code === '23505') return { ok: false, status: 409, error: 'This lead’s source record arrived again after it was archived, so a live copy exists. Merge or delete that one first.' }
  if (error) return { ok: false, status: 500, error: 'Could not restore the lead.' }
  return data ? { ok: true } : { ok: false, status: 404, error: 'This lead is not in the Archive (it may have been restored or erased).' }
}

export async function eraseArchivedLead(orgId: string, leadId: string): Promise<ArchiveResult> {
  const { data, error } = await untyped().rpc('erase_archived_lead', { p_lead: leadId, p_org: orgId })
  if (error) return { ok: false, status: 500, error: 'Could not erase the lead.' }
  return data ? { ok: true } : { ok: false, status: 404, error: 'This lead is not in the Archive.' }
}
