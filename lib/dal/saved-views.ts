// lib/dal/saved-views.ts
// Saved views for the leads list and board. Callers authorise the organisation first (authorizeOrgAccess);
// every query here is additionally scoped by organisation, and the who-may-change-what rules live in
// lib/leads/view-filters.ts (canEditView / canShareViews) so the API and the UI agree.
import { createServiceClient } from '@/lib/supabase/server'
import type { DalResult } from '@/lib/dal/routing'
import type { Json } from '@/types/database'
import {
  MAX_VIEWS_PER_PERSON, canEditView, canSeeView, canShareViews, normalizeFilters,
  type Layout, type LeadFilters, type Viewer,
} from '@/lib/leads/view-filters'

export interface SavedView {
  id: string
  name: string
  layout: Layout
  filters: LeadFilters
  shared: boolean
  ownerId: string
  ownerName: string | null
  mine: boolean
  editable: boolean
}

interface Row {
  id: string
  org_id: string
  owner_id: string
  name: string
  layout: string
  filters: unknown
  shared: boolean
  owner?: { full_name: string | null } | null
}

const COLUMNS = 'id, org_id, owner_id, name, layout, filters, shared, owner:profiles!saved_views_owner_id_fkey(full_name)'

function toView(r: Row, viewer: Viewer): SavedView {
  return {
    id: r.id,
    name: r.name,
    layout: r.layout === 'board' ? 'board' : 'list',
    filters: normalizeFilters(r.filters),
    shared: r.shared,
    ownerId: r.owner_id,
    ownerName: r.owner?.full_name ?? null,
    mine: r.owner_id === viewer.profileId,
    editable: canEditView(r, viewer),
  }
}

function fail(error: { code?: string; message?: string } | null, fallback: string) {
  if (error?.code === '23505') return { success: false as const, error: 'You already have a view with that name.', status: 409 }
  if (error?.message?.includes('only managers can share')) return { success: false as const, error: 'Only managers can share views with the team.', status: 403 }
  if (error?.code === '23514') return { success: false as const, error: 'The view name must be 1–60 characters.', status: 400 }
  return { success: false as const, error: fallback, status: 500 }
}

/** The member's own views, then views shared with the team. */
export async function listViews(orgId: string, viewer: Viewer): Promise<SavedView[]> {
  const db = createServiceClient()
  const { data } = await db.from('saved_views').select(COLUMNS)
    .eq('org_id', orgId).eq('entity', 'leads')
    .or(`owner_id.eq.${viewer.profileId},shared.eq.true`)
    .order('created_at', { ascending: true })
  const views = ((data ?? []) as unknown as Row[]).map((r) => toView(r, viewer))
  return [...views.filter((v) => v.mine), ...views.filter((v) => !v.mine)]
}

/** One view, if this member may see it (otherwise null — a personal view of someone else is "not found"). */
export async function getView(orgId: string, viewId: string, viewer: Viewer): Promise<SavedView | null> {
  const db = createServiceClient()
  const { data } = await db.from('saved_views').select(COLUMNS).eq('org_id', orgId).eq('id', viewId).maybeSingle()
  const row = data as unknown as Row | null
  return row && canSeeView(row, viewer) ? toView(row, viewer) : null
}

export interface ViewInput {
  name: string
  layout: Layout
  filters: LeadFilters
  shared: boolean
}

export async function createView(orgId: string, viewer: Viewer, input: ViewInput): Promise<DalResult<SavedView>> {
  if (input.shared && !canShareViews(viewer.role)) {
    return { success: false, error: 'Only managers can share views with the team.', status: 403 }
  }
  const db = createServiceClient()
  const { count } = await db.from('saved_views').select('id', { count: 'exact', head: true })
    .eq('org_id', orgId).eq('owner_id', viewer.profileId)
  if ((count ?? 0) >= MAX_VIEWS_PER_PERSON) {
    return { success: false, error: `You can keep up to ${MAX_VIEWS_PER_PERSON} saved views. Delete one first.`, status: 400 }
  }
  const { data, error } = await db.from('saved_views').insert({
    org_id: orgId,
    owner_id: viewer.profileId,
    name: input.name,
    layout: input.layout,
    filters: normalizeFilters(input.filters) as Json,
    shared: input.shared,
  }).select(COLUMNS).single()
  if (error || !data) return fail(error, 'Could not save the view.')
  return { success: true, data: toView(data as unknown as Row, viewer) }
}

/** Finds a view this member may change; a view they cannot see is reported as not found. */
async function loadEditable(orgId: string, viewId: string, viewer: Viewer): Promise<DalResult<Row>> {
  const db = createServiceClient()
  const { data } = await db.from('saved_views').select(COLUMNS).eq('org_id', orgId).eq('id', viewId).maybeSingle()
  const row = data as unknown as Row | null
  if (!row || !canSeeView(row, viewer)) return { success: false, error: 'View not found.', status: 404 }
  if (!canEditView(row, viewer)) return { success: false, error: 'Only the person who made this view, or a manager, can change it.', status: 403 }
  return { success: true, data: row }
}

export async function updateView(
  orgId: string, viewId: string, viewer: Viewer, patch: Partial<ViewInput>
): Promise<DalResult<SavedView>> {
  const found = await loadEditable(orgId, viewId, viewer)
  if (!found.success) return found
  if (patch.shared !== undefined && patch.shared !== found.data.shared && !canShareViews(viewer.role)) {
    return { success: false, error: 'Only managers can share views with the team.', status: 403 }
  }
  const update: { name?: string; layout?: string; filters?: Json; shared?: boolean } = {}
  if (patch.name !== undefined) update.name = patch.name
  if (patch.layout !== undefined) update.layout = patch.layout
  if (patch.filters !== undefined) update.filters = normalizeFilters(patch.filters) as Json
  if (patch.shared !== undefined) update.shared = patch.shared
  const db = createServiceClient()
  const { data, error } = await db.from('saved_views').update(update)
    .eq('org_id', orgId).eq('id', viewId).select(COLUMNS).single()
  if (error || !data) return fail(error, 'Could not update the view.')
  return { success: true, data: toView(data as unknown as Row, viewer) }
}

export async function deleteView(orgId: string, viewId: string, viewer: Viewer): Promise<DalResult<null>> {
  const found = await loadEditable(orgId, viewId, viewer)
  if (!found.success) return found
  const db = createServiceClient()
  const { error } = await db.from('saved_views').delete().eq('org_id', orgId).eq('id', viewId)
  if (error) return fail(error, 'Could not delete the view.')
  return { success: true, data: null }
}
