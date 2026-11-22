// lib/dal/listings.ts — agency listings (20260079). Callers authorise first (a member of a channel-partner
// workspace). Every query is scoped by organisation. The owner's contact details and the full address are returned
// only to the agency's managers and above, the listing's agent and whoever added it (canSeeOwner).
import { createServiceClient } from '@/lib/supabase/server'
import { isManagement } from '@/lib/auth/permissions'
import type { MemberRole } from '@/types/database'
import { DEFAULT_SHARE_TEMPLATE, hasListingNeeds, listingFromRow, scoreListing, type Listing, type ListingNeeds } from '@/lib/listings/listing'

// listings is not in the generated types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as unknown as { from: (t: string) => any }

export interface ListingViewer { role: MemberRole; profileId: string }

export function canSeeOwner(v: ListingViewer, row: { assigned_to?: unknown; created_by?: unknown }): boolean {
  return isManagement(v.role) || row.assigned_to === v.profileId || row.created_by === v.profileId
}
/** May change the listing: managers and above, its agent, or whoever added it. Viewers never. */
export function canEditListing(v: ListingViewer, row: { assigned_to?: unknown; created_by?: unknown }): boolean {
  if (v.role === 'readonly' || v.role === 'post_sales') return false
  return canSeeOwner(v, row)
}

export interface ListingRow extends Listing { assigneeName: string | null; canEdit: boolean }

const COLUMNS = '*, assignee:profiles!listings_assigned_to_fkey(full_name)'

function toRow(r: Record<string, unknown>, v: ListingViewer): ListingRow {
  return { ...listingFromRow(r, canSeeOwner(v, r)), assigneeName: (r.assignee as { full_name?: string } | null)?.full_name ?? null, canEdit: canEditListing(v, r) }
}

export async function listListings(orgId: string, v: ListingViewer, f: { kind?: string | null; status?: string | null; q?: string | null } = {}): Promise<ListingRow[]> {
  let q = db().from('listings').select(COLUMNS).eq('org_id', orgId)
  if (f.kind === 'sale' || f.kind === 'rent') q = q.eq('kind', f.kind)
  q = f.status && f.status !== 'all' ? q.eq('status', f.status) : q.in('status', ['available', 'on_hold'])
  if (f.q) { const s = f.q.replace(/[%_,()]/g, ' ').trim().slice(0, 60); if (s) q = q.or(`title.ilike.%${s}%,locality.ilike.%${s}%,city.ilike.%${s}%`) }
  const { data } = await q.order('updated_at', { ascending: false }).limit(500)
  return ((data ?? []) as Record<string, unknown>[]).map((r) => toRow(r, v))
}

export async function getListing(orgId: string, id: string, v: ListingViewer): Promise<ListingRow | null> {
  const { data } = await db().from('listings').select(COLUMNS).eq('org_id', orgId).eq('id', id).maybeSingle()
  return data ? toRow(data as Record<string, unknown>, v) : null
}

/** The raw permission fields, for routes that check before changing a listing. */
export async function listingAccessRow(orgId: string, id: string): Promise<{ assigned_to: string | null; created_by: string | null } | null> {
  const { data } = await db().from('listings').select('assigned_to, created_by').eq('org_id', orgId).eq('id', id).maybeSingle()
  return data ?? null
}

export async function createListing(orgId: string, actorId: string, row: Record<string, unknown>, assignedTo: string | null): Promise<{ id: string } | { error: string }> {
  const { data, error } = await db().from('listings').insert({ ...row, org_id: orgId, created_by: actorId, assigned_to: assignedTo ?? actorId }).select('id').single()
  if (error) return { error: /not a member/.test(error.message) ? 'The agent must be a member of this workspace.' : 'Could not save the listing.' }
  return { id: data.id }
}

export async function updateListing(orgId: string, id: string, patch: Record<string, unknown>): Promise<boolean> {
  const { data, error } = await db().from('listings').update(patch).eq('org_id', orgId).eq('id', id).select('id').maybeSingle()
  return !error && !!data
}

export async function deleteListing(orgId: string, id: string): Promise<boolean> {
  const { data, error } = await db().from('listings').delete().eq('org_id', orgId).eq('id', id).select('id').maybeSingle()
  return !error && !!data
}

/** Available listings that fit a buyer or tenant, best first. Owner details are never included here. */
export async function matchListingsForLead(orgId: string, needs: ListingNeeds, limit = 8) {
  if (!hasListingNeeds(needs)) return []
  let q = db().from('listings').select('*').eq('org_id', orgId).eq('status', 'available')
  if (needs.req_purpose === 'rent') q = q.eq('kind', 'rent')
  if (needs.req_purpose === 'buy') q = q.eq('kind', 'sale')
  const { data } = await q.limit(1000)
  return ((data ?? []) as Record<string, unknown>[])
    .map((r) => ({ listing: listingFromRow(r, false), match: scoreListing(needs, listingFromRow(r, false)) }))
    .filter((x): x is { listing: Listing; match: NonNullable<typeof x.match> } => !!x.match)
    .sort((a, b) => b.match.score - a.match.score)
    .slice(0, limit)
}

export async function getShareTemplate(orgId: string): Promise<string> {
  const { data } = await db().from('org_settings').select('listings').eq('org_id', orgId).maybeSingle()
  const t = (data?.listings as { shareTemplate?: unknown } | null)?.shareTemplate
  return typeof t === 'string' && t.trim() ? t : DEFAULT_SHARE_TEMPLATE
}

export async function saveShareTemplate(orgId: string, actorId: string, template: string): Promise<boolean> {
  const { error } = await db().from('org_settings').upsert({ org_id: orgId, listings: { shareTemplate: template }, updated_by: actorId, updated_at: new Date().toISOString() }, { onConflict: 'org_id' })
  return !error
}
