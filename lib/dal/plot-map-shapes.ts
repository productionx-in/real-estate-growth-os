// lib/dal/plot-map-shapes.ts — the plot boundaries on a draft map version (20260082). Callers authorise first and
// require the project's add-on (lib/plots/gate.ts). Shapes are checked here with the same pure rules the editor uses
// (lib/plots/geometry.ts) and saved atomically by save_plot_map_shapes(); the database re-checks ownership, the draft
// state, duplicates and the add-on. Only links a person confirmed are stored: suggestions stay in the browser.
import { createServiceClient } from '@/lib/supabase/server'
import { cleanShape, isSubmittable, validateShapes, type Pt, type ShapeInput, type Validation } from '@/lib/plots/geometry'
import { PLOT_MAP_BUCKET } from '@/lib/plots/files'
import type { DalResult } from '@/lib/dal/routing'
import type { Json } from '@/types/database'

const db = () => createServiceClient()
const IMAGE_URL_SECONDS = 600

export interface EditorUnit { id: string; unitNumber: string; status: string }
export interface EditorShape { id: string; label: string; kind: 'polygon' | 'rect'; points: Pt[]; unitId: string | null; linkedAt: string | null }
export interface EditorData {
  version: { id: string; layoutId: string; layoutName: string; versionNo: number; status: string; width: number; height: number; page: number }
  imageUrl: string | null
  shapes: EditorShape[]
  units: EditorUnit[]
  editable: boolean
}

async function projectUnits(orgId: string, projectId: string): Promise<EditorUnit[]> {
  const { data } = await db().from('inventory_items').select('id, unit_number, status').eq('org_id', orgId).eq('project_id', projectId).order('unit_number').limit(10_000)
  return (data ?? []).map((u) => ({ id: u.id, unitNumber: u.unit_number, status: String(u.status) }))
}

export async function getEditorData(orgId: string, versionId: string): Promise<EditorData | null> {
  const client = db()
  const { data: v } = await client.from('plot_map_versions')
    .select('id, project_id, layout_id, version_no, page, status, render_status, image_path, image_width, image_height')
    .eq('org_id', orgId).eq('id', versionId).maybeSingle()
  if (!v || v.render_status !== 'ready') return null
  const [{ data: layout }, { data: shapes }, units, signed] = await Promise.all([
    client.from('plot_layouts').select('name').eq('org_id', orgId).eq('id', v.layout_id).maybeSingle(),
    client.from('plot_map_shapes').select('id, label, kind, points, unit_id, linked_at').eq('org_id', orgId).eq('version_id', versionId).order('label').limit(2000),
    projectUnits(orgId, v.project_id),
    client.storage.from(PLOT_MAP_BUCKET).createSignedUrl(v.image_path, IMAGE_URL_SECONDS),
  ])
  return {
    version: { id: v.id, layoutId: v.layout_id, layoutName: layout?.name ?? 'Map', versionNo: v.version_no, status: v.status, width: v.image_width!, height: v.image_height!, page: v.page },
    imageUrl: signed.data?.signedUrl ?? null,
    shapes: (shapes ?? []).map((s) => ({ id: s.id, label: s.label, kind: s.kind as 'polygon' | 'rect', points: s.points as unknown as Pt[], unitId: s.unit_id, linkedAt: s.linked_at })),
    units,
    editable: v.status === 'draft' || v.status === 'rejected',
  }
}

/** Validate and save a draft's whole set of shapes. Shape errors, duplicate plot numbers and units linked twice are
 *  refused; overlaps, unlinked plots and unmapped units are returned as warnings (they block review, not saving). */
export async function saveShapes(orgId: string, versionId: string, actorId: string, shapes: ShapeInput[]): Promise<DalResult<{ saved: number; validation: Validation; submittable: boolean }>> {
  const client = db()
  const { data: v } = await client.from('plot_map_versions').select('id, project_id, status').eq('org_id', orgId).eq('id', versionId).maybeSingle()
  if (!v) return { success: false, error: 'Version not found.', status: 404 }
  if (v.status !== 'draft' && v.status !== 'rejected') return { success: false, error: 'Only a draft version can be edited.', status: 409 }
  const units = await projectUnits(orgId, v.project_id)
  const clean = shapes.map(cleanShape)
  const validation = validateShapes(clean, units.map((u) => ({ id: u.id, unit_number: u.unitNumber })))
  if (validation.errors.length || validation.duplicateLabels.length || validation.duplicateUnits.length) {
    const first = validation.errors[0]
      ?? (validation.duplicateLabels.length ? `Plot number ${validation.duplicateLabels[0]} is used more than once.` : `Unit ${validation.duplicateUnits[0]} is linked to more than one plot.`)
    return { success: false, error: first, status: 400 }
  }
  const payload = clean.map((s) => ({ id: s.id ?? null, label: s.label, kind: s.kind, points: s.points, unit_id: s.unitId }))
  const { data, error } = await client.rpc('save_plot_map_shapes', { p_org: orgId, p_version: versionId, p_actor: actorId, p_shapes: payload as unknown as Json })
  if (error) {
    if (/not active/.test(error.message)) return { success: false, error: 'The Interactive Plot Map add-on is not active for this project.', status: 403 }
    if (/only a draft/.test(error.message)) return { success: false, error: 'Only a draft version can be edited.', status: 409 }
    if (/unit belongs/.test(error.message)) return { success: false, error: 'A linked unit is not in this project.', status: 400 }
    return { success: false, error: 'Could not save the plots.', status: 500 }
  }
  return { success: true, data: { saved: Number(data ?? 0), validation, submittable: isSubmittable(validation) } }
}

export async function versionProject(orgId: string, versionId: string): Promise<string | null> {
  const { data } = await db().from('plot_map_versions').select('project_id').eq('org_id', orgId).eq('id', versionId).maybeSingle()
  return data?.project_id ?? null
}
