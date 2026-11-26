// lib/dal/plot-map-staff.ts — option (c): RE by PX staff draw plot boundaries for a customer (20260085).
// The workspace's owner or admin allows it per project for up to 31 days (default 14) and can withdraw it at any
// time. While allowed, staff with CAN.plotMapSetup see the project's draft page images and plot outlines — never
// inventory, prices or buyers — and save through save_plot_map_shapes_as_staff(), which keeps every confirmed link
// the customer made and can never create one. The customer links, submits, approves and publishes as before.
import { createServiceClient } from '@/lib/supabase/server'
import { cleanShape, validateShapes, type Pt, type ShapeInput } from '@/lib/plots/geometry'
import { PLOT_MAP_BUCKET } from '@/lib/plots/files'
import { notifyAdmins } from '@/lib/dal/plot-map-setup'
import type { DalResult } from '@/lib/dal/routing'
import type { Json } from '@/types/database'

const db = () => createServiceClient()
export const STAFF_ACCESS_DEFAULT_DAYS = 14
export const STAFF_ACCESS_MAX_DAYS = 31

export interface StaffAccess { id: string; grantedAt: string; expiresAt: string; grantedBy: string | null }

/** The open, unexpired permission for a project, if any. */
export async function getStaffAccess(orgId: string, projectId: string): Promise<StaffAccess | null> {
  const { data } = await db().from('plot_map_staff_access').select('id, granted_at, expires_at, granted_by')
    .eq('org_id', orgId).eq('project_id', projectId).is('revoked_at', null).gt('expires_at', new Date().toISOString()).maybeSingle()
  if (!data) return null
  const { data: p } = data.granted_by ? await db().from('profiles').select('full_name').eq('id', data.granted_by).maybeSingle() : { data: null }
  return { id: data.id, grantedAt: data.granted_at, expiresAt: data.expires_at, grantedBy: p?.full_name ?? null }
}

export async function grantStaffAccess(orgId: string, projectId: string, profileId: string, days = STAFF_ACCESS_DEFAULT_DAYS): Promise<DalResult<StaffAccess>> {
  const d = Math.round(days)
  if (!(d >= 1 && d <= STAFF_ACCESS_MAX_DAYS)) return { success: false, error: `Choose 1 to ${STAFF_ACCESS_MAX_DAYS} days.`, status: 400 }
  const client = db()
  // A lapsed permission is closed first, so a new one can be given.
  await client.from('plot_map_staff_access').update({ revoked_at: new Date().toISOString() })
    .eq('org_id', orgId).eq('project_id', projectId).is('revoked_at', null).lte('expires_at', new Date().toISOString())
  const now = new Date()
  const { error } = await client.from('plot_map_staff_access').insert({
    org_id: orgId, project_id: projectId, granted_by: profileId, granted_at: now.toISOString(), expires_at: new Date(now.getTime() + d * 86_400_000).toISOString(),
  })
  if (error) {
    if (error.code === '23505') return { success: false, error: 'RE by PX is already allowed to draw on this project.', status: 409 }
    if (/not active/.test(error.message)) return { success: false, error: 'The Interactive Plot Map add-on is not active for this project.', status: 403 }
    if (/another organisation/.test(error.message)) return { success: false, error: 'Project not found.', status: 404 }
    return { success: false, error: 'Could not save.', status: 500 }
  }
  return { success: true, data: (await getStaffAccess(orgId, projectId))! }
}

export async function revokeStaffAccess(orgId: string, projectId: string, profileId: string): Promise<DalResult<null>> {
  const { data, error } = await db().from('plot_map_staff_access').update({ revoked_at: new Date().toISOString(), revoked_by: profileId })
    .eq('org_id', orgId).eq('project_id', projectId).is('revoked_at', null).select('id')
  if (error) return { success: false, error: 'Could not save.', status: 500 }
  if (!(data ?? []).length) return { success: false, error: 'RE by PX is not allowed to draw on this project.', status: 404 }
  return { success: true, data: null }
}

// ── the staff side (metadata, page images and outlines only) ───────────────────────────────────────────────────

export interface StaffVersion { id: string; layoutName: string; versionNo: number; status: string; page: number; ready: boolean; plots: number }

/** The project's map versions for staff, when the workspace allows drawing; null otherwise. */
export async function staffVersions(orgId: string, projectId: string): Promise<{ access: StaffAccess; versions: StaffVersion[]; projectName: string; orgName: string } | null> {
  const access = await getStaffAccess(orgId, projectId)
  if (!access) return null
  const client = db()
  const [{ data: vers }, { data: layouts }, { data: project }, { data: org }] = await Promise.all([
    client.from('plot_map_versions').select('id, layout_id, version_no, status, page, render_status').eq('org_id', orgId).eq('project_id', projectId).order('version_no', { ascending: false }).limit(100),
    client.from('plot_layouts').select('id, name').eq('org_id', orgId).eq('project_id', projectId),
    client.from('projects').select('name').eq('org_id', orgId).eq('id', projectId).maybeSingle(),
    client.from('organisations').select('name').eq('id', orgId).maybeSingle(),
  ])
  const ids = (vers ?? []).map((v) => v.id)
  const { data: shapes } = ids.length ? await client.from('plot_map_shapes').select('version_id').eq('org_id', orgId).in('version_id', ids).limit(20_000) : { data: [] }
  const count = new Map<string, number>()
  for (const s of shapes ?? []) count.set(s.version_id, (count.get(s.version_id) ?? 0) + 1)
  return {
    access, projectName: project?.name ?? '', orgName: org?.name ?? '',
    versions: (vers ?? []).map((v) => ({ id: v.id, layoutName: (layouts ?? []).find((l) => l.id === v.layout_id)?.name ?? 'Map', versionNo: v.version_no, status: v.status, page: v.page, ready: v.render_status === 'ready', plots: count.get(v.id) ?? 0 })),
  }
}

export interface StaffEditorData {
  version: { id: string; projectId: string; layoutName: string; versionNo: number; status: string; width: number; height: number }
  imageUrl: string | null
  /** unitId is a marker ("linked:<shape id>") when the customer linked the plot — never the unit's id. */
  shapes: { id: string; label: string; kind: 'polygon' | 'rect'; points: Pt[]; unitId: string | null }[]
  editable: boolean
}

export async function staffEditorData(orgId: string, versionId: string): Promise<StaffEditorData | null> {
  const client = db()
  const { data: v } = await client.from('plot_map_versions').select('id, project_id, layout_id, version_no, status, render_status, image_path, image_width, image_height')
    .eq('org_id', orgId).eq('id', versionId).maybeSingle()
  if (!v || v.render_status !== 'ready' || !(await getStaffAccess(orgId, v.project_id))) return null
  const [{ data: layout }, { data: shapes }, signed] = await Promise.all([
    client.from('plot_layouts').select('name').eq('org_id', orgId).eq('id', v.layout_id).maybeSingle(),
    client.from('plot_map_shapes').select('id, label, kind, points, unit_id').eq('org_id', orgId).eq('version_id', versionId).order('label').limit(2000),
    client.storage.from(PLOT_MAP_BUCKET).createSignedUrl(v.image_path, 600),
  ])
  return {
    version: { id: v.id, projectId: v.project_id, layoutName: layout?.name ?? 'Map', versionNo: v.version_no, status: v.status, width: v.image_width!, height: v.image_height! },
    imageUrl: signed.data?.signedUrl ?? null,
    shapes: (shapes ?? []).map((s) => ({ id: s.id, label: s.label, kind: s.kind as 'polygon' | 'rect', points: s.points as unknown as Pt[], unitId: s.unit_id ? `linked:${s.id}` : null })),
    editable: v.status === 'draft' || v.status === 'rejected',
  }
}

/** Save a draft's outlines and plot numbers as RE by PX staff. Links are the database's business: kept or dropped there. */
export async function saveShapesAsStaff(orgId: string, versionId: string, staffProfileId: string | null, shapes: Omit<ShapeInput, 'unitId'>[]): Promise<DalResult<{ saved: number; overlaps: number }>> {
  const client = db()
  const { data: v } = await client.from('plot_map_versions').select('id, project_id, status').eq('org_id', orgId).eq('id', versionId).maybeSingle()
  if (!v) return { success: false, error: 'Version not found.', status: 404 }
  if (v.status !== 'draft' && v.status !== 'rejected') return { success: false, error: 'Only a draft version can be edited.', status: 409 }
  const clean = shapes.map((s) => cleanShape({ ...s, unitId: null }))
  const validation = validateShapes(clean, [])
  if (validation.errors.length || validation.duplicateLabels.length) {
    return { success: false, error: validation.errors[0] ?? `Plot number ${validation.duplicateLabels[0]} is used more than once.`, status: 400 }
  }
  const payload = clean.map((s) => ({ id: s.id ?? null, label: s.label, kind: s.kind, points: s.points }))
  const { data, error } = await client.rpc('save_plot_map_shapes_as_staff', { p_org: orgId, p_version: versionId, p_actor: staffProfileId, p_shapes: payload as unknown as Json })
  if (error) {
    if (/has not allowed/.test(error.message)) return { success: false, error: 'The workspace no longer allows RE by PX to draw on this project.', status: 403 }
    if (/not active/.test(error.message)) return { success: false, error: 'The Interactive Plot Map add-on is not active for this project.', status: 403 }
    if (/only a draft/.test(error.message)) return { success: false, error: 'Only a draft version can be edited.', status: 409 }
    return { success: false, error: 'Could not save the plots.', status: 500 }
  }
  // One note a day per version, so the customer knows to review and link.
  await notifyAdmins(orgId, v.project_id, `plot_map:staff_drawn:${versionId}:${new Date().toISOString().slice(0, 10)}`,
    'RE by PX updated your plot boundaries', 'Open the plot map to check the outlines and link each plot to its unit.')
  return { success: true, data: { saved: Number(data ?? 0), overlaps: validation.overlaps.length } }
}

export async function staffProfileId(authUserId: string): Promise<string | null> {
  const { data } = await db().from('profiles').select('id').eq('auth_user_id', authUserId).maybeSingle()
  return data?.id ?? null
}
