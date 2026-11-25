// lib/dal/segments.ts
// Lead segments (20260087). Callers authorise the organisation first (authorizeOrgAccess); every query here is also
// scoped by organisation. Who may manage segments is decided by canManageSegments (lib/segments/segments.ts) and
// re-checked by the database trigger. Which leads a reader sees inside a segment is always the reader's lead scope
// (applyLeadFilters), never the segment's.
import { createServiceClient } from '@/lib/supabase/server'
import type { DalResult } from '@/lib/dal/routing'
import { applyLeadFilters, normalizeFilters, type LeadFilters, type Viewer } from '@/lib/leads/view-filters'
import {
  MAX_ADD_AT_ONCE, MAX_LIST_SIZE, MAX_SEGMENTS_PER_ORG, canManageSegments, cleanDescription, cleanName, segmentFilters,
  templateByKey, type SegmentKind,
} from '@/lib/segments/segments'
import type { Json } from '@/types/database'

export interface Segment {
  id: string
  name: string
  description: string | null
  kind: SegmentKind
  filters: LeadFilters
  template: string | null
  createdAt: string
  updatedAt: string
}

export interface SegmentWithCount extends Segment {
  /** Leads in the segment that this reader can see. */
  count: number
}

// The tables are newer than the generated types; keep the untyped access in one place.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createServiceClient() as unknown as { from: (t: string) => any }

const COLUMNS = 'id, name, description, kind, filters, template, created_at, updated_at'
interface Row { id: string; name: string; description: string | null; kind: string; filters: unknown; template: string | null; created_at: string; updated_at: string }

function toSegment(r: Row): Segment {
  return {
    id: r.id, name: r.name, description: r.description, kind: r.kind === 'fixed' ? 'fixed' : 'dynamic',
    filters: r.kind === 'fixed' ? {} : normalizeFilters(r.filters), template: r.template,
    createdAt: r.created_at, updatedAt: r.updated_at,
  }
}

const refuse = (error: string, status: number) => ({ success: false as const, error, status })

function fail(error: { code?: string; message?: string } | null, fallback: string) {
  if (error?.code === '23505') return refuse('There is already a segment with that name.', 409)
  if (error?.message?.includes('only owners, admins and managers')) return refuse('Only owners, admins and managers can manage segments.', 403)
  if (error?.message?.includes('another organisation')) return refuse('Lead not found.', 404)
  if (error?.code === '23514') return refuse('Check the name (1–60 characters) and description (up to 200).', 400)
  return refuse(fallback, 500)
}

/**
 * The leads of a segment as this reader may see them. The caller adds select columns, order and limit.
 * A fixed list joins its members; a dynamic segment applies its filters. Both apply the reader's scope.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function leadsQuery(orgId: string, segment: Segment, viewer: Viewer, columns: string, opts: { count?: boolean; head?: boolean } = {}): any {
  const fixed = segment.kind === 'fixed'
  const select = fixed ? `${columns}, lead_segment_members!inner(segment_id)` : columns
  let q = db().from('leads').select(select, opts.count ? { count: 'exact', head: !!opts.head } : undefined).eq('org_id', orgId)
  if (fixed) q = q.eq('lead_segment_members.segment_id', segment.id)
  q = applyLeadFilters(q, fixed ? {} : segment.filters, viewer, new Date())
  return q.is('merged_into_id', null)
}

async function countFor(orgId: string, segment: Segment, viewer: Viewer): Promise<number> {
  const { count } = await leadsQuery(orgId, segment, viewer, 'id', { count: true, head: true })
  return count ?? 0
}

export async function listSegments(orgId: string, viewer: Viewer): Promise<SegmentWithCount[]> {
  const { data } = await db().from('lead_segments').select(COLUMNS).eq('org_id', orgId).order('name')
  const segments = ((data ?? []) as Row[]).map(toSegment)
  const counts = await Promise.all(segments.map((s) => countFor(orgId, s, viewer)))
  return segments.map((s, i) => ({ ...s, count: counts[i] }))
}

export async function getSegment(orgId: string, segmentId: string): Promise<Segment | null> {
  const { data } = await db().from('lead_segments').select(COLUMNS).eq('org_id', orgId).eq('id', segmentId).maybeSingle()
  return data ? toSegment(data as Row) : null
}

export interface SegmentLead {
  id: string
  name: string
  phone: string | null
  email: string | null
  status: string
  priority: string | null
  source: string | null
  created_at: string
  project: { name: string } | null
  assignee: { full_name: string | null } | null
}

/** The first `limit` leads of a segment (newest first) and the total this reader can see. */
export async function segmentLeads(orgId: string, segment: Segment, viewer: Viewer, limit = 100): Promise<{ leads: SegmentLead[]; total: number }> {
  const cols = 'id, name, phone, email, status, priority, source, created_at, project:projects(name), assignee:profiles!leads_assigned_to_fkey(full_name)'
  const { data, count } = await leadsQuery(orgId, segment, viewer, cols, { count: true })
    .order('created_at', { ascending: false }).limit(Math.min(Math.max(limit, 1), 500))
  const leads = ((data ?? []) as (SegmentLead & { lead_segment_members?: unknown })[]).map(({ lead_segment_members: _m, ...l }) => l)
  return { leads, total: count ?? leads.length }
}

export interface Actor { profileId: string; role: Viewer['role'] }

export interface CreateInput {
  name?: unknown
  description?: unknown
  kind: SegmentKind
  filters?: unknown
  template?: unknown
  /** Fixed list only: start with every lead (in the actor's scope) matching these filters. */
  snapshotFilters?: unknown
}

export async function createSegment(orgId: string, actor: Actor, input: CreateInput): Promise<DalResult<Segment & { added: number }>> {
  if (!canManageSegments(actor.role)) return refuse('Only owners, admins and managers can manage segments.', 403)
  const template = input.kind === 'dynamic' ? templateByKey(input.template) : undefined
  if (input.template !== undefined && input.template !== null && !template) return refuse('Unknown template.', 400)
  const name = cleanName(input.name ?? template?.name)
  if (!name) return refuse('Give the segment a name of 1–60 characters.', 400)
  const description = cleanDescription(input.description ?? template?.description)

  let filters: LeadFilters = {}
  if (input.kind === 'dynamic') {
    const f = segmentFilters(template ? template.filters : input.filters)
    if (!f) return refuse('Choose at least one filter (stage, source, priority, project, tag, date or search).', 400)
    filters = f
  }
  let snapshot: LeadFilters | null = null
  if (input.kind === 'fixed' && input.snapshotFilters !== undefined) {
    snapshot = segmentFilters(input.snapshotFilters)
    if (!snapshot) return refuse('Choose at least one filter to copy leads from.', 400)
  }

  const { count } = await db().from('lead_segments').select('id', { count: 'exact', head: true }).eq('org_id', orgId)
  if ((count ?? 0) >= MAX_SEGMENTS_PER_ORG) return refuse(`A workspace can have up to ${MAX_SEGMENTS_PER_ORG} segments. Delete one you no longer use.`, 409)

  const { data, error } = await db().from('lead_segments').insert({
    org_id: orgId, name, description, kind: input.kind, filters: filters as unknown as Json,
    template: template?.key ?? null, created_by: actor.profileId,
  }).select(COLUMNS).single()
  if (error || !data) return fail(error, 'Could not create the segment.')
  const segment = toSegment(data as Row)

  let added = 0
  if (snapshot) {
    const asDynamic: Segment = { ...segment, kind: 'dynamic', filters: snapshot }
    const { data: rows } = await leadsQuery(orgId, asDynamic, actor, 'id').order('created_at', { ascending: false }).limit(MAX_LIST_SIZE)
    const ids = ((rows ?? []) as { id: string }[]).map((r) => r.id)
    if (ids.length) {
      const res = await insertMembers(orgId, segment.id, ids, actor.profileId)
      if (!res.success) {
        await db().from('lead_segments').delete().eq('org_id', orgId).eq('id', segment.id)
        return res
      }
      added = res.data
    }
  }
  return { success: true, data: { ...segment, added } }
}

export async function updateSegment(
  orgId: string, actor: Actor, segmentId: string, input: { name?: unknown; description?: unknown; filters?: unknown }
): Promise<DalResult<Segment>> {
  if (!canManageSegments(actor.role)) return refuse('Only owners, admins and managers can manage segments.', 403)
  const current = await getSegment(orgId, segmentId)
  if (!current) return refuse('Segment not found.', 404)
  const update: Record<string, unknown> = {}
  if (input.name !== undefined) {
    const name = cleanName(input.name)
    if (!name) return refuse('Give the segment a name of 1–60 characters.', 400)
    update.name = name
  }
  if (input.description !== undefined) update.description = cleanDescription(input.description)
  if (input.filters !== undefined) {
    if (current.kind !== 'dynamic') return refuse('A fixed list has no filters; add or remove leads instead.', 400)
    const f = segmentFilters(input.filters)
    if (!f) return refuse('Choose at least one filter.', 400)
    update.filters = f
    update.template = null // edited: no longer the starter template as shipped
  }
  if (!Object.keys(update).length) return { success: true, data: current }
  const { data, error } = await db().from('lead_segments').update(update).eq('org_id', orgId).eq('id', segmentId).select(COLUMNS).single()
  if (error || !data) return fail(error, 'Could not update the segment.')
  return { success: true, data: toSegment(data as Row) }
}

export async function deleteSegment(orgId: string, actor: Actor, segmentId: string): Promise<DalResult<{ name: string }>> {
  if (!canManageSegments(actor.role)) return refuse('Only owners, admins and managers can manage segments.', 403)
  const current = await getSegment(orgId, segmentId)
  if (!current) return refuse('Segment not found.', 404)
  const { error } = await db().from('lead_segments').delete().eq('org_id', orgId).eq('id', segmentId)
  if (error) return fail(error, 'Could not delete the segment.')
  return { success: true, data: { name: current.name } }
}

async function insertMembers(orgId: string, segmentId: string, leadIds: string[], actorProfileId: string): Promise<DalResult<number>> {
  const { count: have } = await db().from('lead_segment_members').select('lead_id', { count: 'exact', head: true }).eq('segment_id', segmentId)
  const { data: already } = await db().from('lead_segment_members').select('lead_id').eq('segment_id', segmentId).in('lead_id', leadIds)
  const known = new Set(((already ?? []) as { lead_id: string }[]).map((r) => r.lead_id))
  const fresh = leadIds.filter((id) => !known.has(id))
  if ((have ?? 0) + fresh.length > MAX_LIST_SIZE) return refuse(`A list can hold up to ${MAX_LIST_SIZE} leads.`, 409)
  for (let i = 0; i < fresh.length; i += MAX_ADD_AT_ONCE) {
    const chunk = fresh.slice(i, i + MAX_ADD_AT_ONCE).map((lead_id) => ({ segment_id: segmentId, org_id: orgId, lead_id, added_by: actorProfileId }))
    const { error } = await db().from('lead_segment_members').upsert(chunk, { onConflict: 'segment_id,lead_id', ignoreDuplicates: true })
    if (error) return fail(error, 'Could not add the leads to the list.')
  }
  return { success: true, data: fresh.length }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function cleanIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null
  const ids = [...new Set(raw.filter((x): x is string => typeof x === 'string' && UUID.test(x)).map((x) => x.toLowerCase()))]
  return ids.length && ids.length <= MAX_ADD_AT_ONCE && ids.length === raw.length ? ids : null
}

/** Adds leads to a fixed list. Every lead must be a current lead of this organisation that the actor can see. */
export async function addToList(orgId: string, actor: Actor, segmentId: string, rawIds: unknown): Promise<DalResult<{ added: number }>> {
  if (!canManageSegments(actor.role)) return refuse('Only owners, admins and managers can manage segments.', 403)
  const ids = cleanIds(rawIds)
  if (!ids) return refuse(`Send between 1 and ${MAX_ADD_AT_ONCE} lead ids.`, 400)
  const segment = await getSegment(orgId, segmentId)
  if (!segment) return refuse('Segment not found.', 404)
  if (segment.kind !== 'fixed') return refuse('Leads join a dynamic segment by matching its filters; only fixed lists take leads by hand.', 400)
  let q = db().from('leads').select('id').eq('org_id', orgId).in('id', ids)
  q = applyLeadFilters(q, {}, actor, new Date())
  const { data: visible } = await q
  if ((visible ?? []).length !== ids.length) return refuse('Lead not found.', 404)
  const res = await insertMembers(orgId, segmentId, ids, actor.profileId)
  return res.success ? { success: true, data: { added: res.data } } : res
}

export async function removeFromList(orgId: string, actor: Actor, segmentId: string, rawIds: unknown): Promise<DalResult<{ removed: number }>> {
  if (!canManageSegments(actor.role)) return refuse('Only owners, admins and managers can manage segments.', 403)
  const ids = cleanIds(rawIds)
  if (!ids) return refuse(`Send between 1 and ${MAX_ADD_AT_ONCE} lead ids.`, 400)
  const segment = await getSegment(orgId, segmentId)
  if (!segment || segment.kind !== 'fixed') return refuse('Segment not found.', 404)
  const { data, error } = await db().from('lead_segment_members').delete().eq('org_id', orgId).eq('segment_id', segmentId).in('lead_id', ids).select('lead_id')
  if (error) return fail(error, 'Could not remove the leads.')
  return { success: true, data: { removed: (data ?? []).length } }
}

/** The organisation's fixed lists, and whether this lead is in each (for "Add to list" on a lead's page). */
export async function listsForLead(orgId: string, leadId: string): Promise<{ id: string; name: string; member: boolean }[]> {
  const [{ data: lists }, { data: mine }] = await Promise.all([
    db().from('lead_segments').select('id, name').eq('org_id', orgId).eq('kind', 'fixed').order('name'),
    db().from('lead_segment_members').select('segment_id').eq('org_id', orgId).eq('lead_id', leadId),
  ])
  const inList = new Set(((mine ?? []) as { segment_id: string }[]).map((r) => r.segment_id))
  return ((lists ?? []) as { id: string; name: string }[]).map((l) => ({ id: l.id, name: l.name, member: inList.has(l.id) }))
}

/** The leads a campaign would reach (newest first, up to `limit`), as this sender may see them. */
export async function segmentCandidates(orgId: string, segment: Segment, viewer: Viewer, limit: number): Promise<{ id: string; name: string | null; email: string | null; phone: string | null; status: string }[]> {
  const { data } = await leadsQuery(orgId, segment, viewer, 'id, name, email, phone, status')
    .order('created_at', { ascending: false }).limit(limit)
  return ((data ?? []) as { id: string; name: string | null; email: string | null; phone: string | null; status: string; lead_segment_members?: unknown }[])
    .map(({ lead_segment_members: _m, ...l }) => l)
}
