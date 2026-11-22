// lib/dal/lead-fields.ts — a lead's values for the workspace's own fields (leads_all.custom_fields, 20260075).
// Callers authorise first (authorizeLeadWork) and check values with lib/settings/fields.ts.
import { createServiceClient } from '@/lib/supabase/server'
import type { FieldValue, FieldValues } from '@/lib/settings/fields'

// custom_fields is not in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as unknown as { from: (t: string) => any }

export async function getLeadFieldValues(orgId: string, leadId: string): Promise<FieldValues> {
  const { data } = await db().from('leads').select('custom_fields').eq('org_id', orgId).eq('id', leadId).maybeSingle()
  const v = data?.custom_fields
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as FieldValues) : {}
}

/** Applies a checked patch (null removes a value), keeps the other fields, and records what changed. */
export async function saveLeadFieldValues(orgId: string, leadId: string, actorId: string, patch: Record<string, FieldValue | null>, labels: Record<string, string>): Promise<{ ok: boolean; changed: string[] }> {
  const current = await getLeadFieldValues(orgId, leadId)
  const next: FieldValues = { ...current }
  const changed: string[] = []
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) { if (k in next) { delete next[k]; changed.push(k) } }
    else if (next[k] !== v) { next[k] = v; changed.push(k) }
  }
  if (!changed.length) return { ok: true, changed }
  const { error } = await db().from('leads').update({ custom_fields: next }).eq('org_id', orgId).eq('id', leadId)
  if (error) return { ok: false, changed: [] }
  await db().from('lead_activities').insert({
    lead_id: leadId, actor_id: actorId, type: 'details_updated', note: null,
    metadata: { fields: changed.map((k) => labels[k] ?? k) },
  })
  return { ok: true, changed }
}
