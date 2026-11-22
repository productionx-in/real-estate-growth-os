// lib/dal/plot-layouts.ts — interactive plot maps (add-on, 20260072). Callers authorise first and check the add-on
// (lib/plots/addons.ts); every query here is scoped by organisation, and the database re-checks that a layout's
// project and every linked unit belong to it. Statuses are read live from inventory_items: the map is never a copy.
import crypto from 'node:crypto'
import { parseEmbedDomains } from '@/lib/plots/embed'
import { createServiceClient } from '@/lib/supabase/server'
import { parseLayoutSvg, LayoutError, type LayoutLabel, type LayoutShape } from '@/lib/plots/svg'
import { matchShapes, type MatchReport } from '@/lib/plots/match'
import { getProjectAddon } from '@/lib/plots/addons'
import { publishedVersionGeometry, versionImageUrl } from '@/lib/dal/plot-map-publishing'
import type { DalResult } from '@/lib/dal/routing'
import type { Json } from '@/types/database'

export interface LayoutGeometry { shapes: LayoutShape[]; labels: LayoutLabel[] }
export interface LayoutSummary {
  id: string; projectId: string; name: string; status: 'draft' | 'published'; shareEnabled: boolean; showPrices: boolean
  /** Websites (https origins) allowed to show the public map in a frame. */
  embedDomains: string[]
  shareToken: string | null; plots: number; linked: number; publishedAt: string | null; updatedAt: string
}

/** What a plot shows: everything a salesperson needs, nothing internal (no notes, no buyer). */
export interface PlotInfo {
  unitId: string; unitNumber: string; status: string; category: string
  area: number | null; areaUnit: string | null; dimensions: string | null; facing: string | null
  corner: boolean; roadWidthFt: number | null; price: number | null
}

const UNIT_COLUMNS = 'id, unit_number, status, category, plot_area, area_value, area_unit, plot_dimensions, facing, is_corner_plot, road_width_ft, total_price'
type UnitRow = { id: string; unit_number: string; status: string; category: string; plot_area: number | null; area_value: number | null; area_unit: string | null; plot_dimensions: string | null; facing: string | null; is_corner_plot: boolean; road_width_ft: number | null; total_price: number | null }

const toInfo = (u: UnitRow, withPrice: boolean): PlotInfo => ({
  unitId: u.id, unitNumber: u.unit_number, status: u.status, category: u.category,
  area: u.plot_area ?? u.area_value, areaUnit: u.area_unit, dimensions: u.plot_dimensions, facing: u.facing,
  corner: u.is_corner_plot === true, roadWidthFt: u.road_width_ft, price: withPrice ? u.total_price : null,
})

export async function listLayouts(orgId: string, projectId?: string): Promise<LayoutSummary[]> {
  const db = createServiceClient()
  let q = db.from('plot_layouts').select('id, project_id, name, status, share_enabled, show_prices, embed_domains, share_token, geometry, published_at, updated_at, published_version_id').eq('org_id', orgId)
  if (projectId) q = q.eq('project_id', projectId)
  const { data } = await q.order('created_at')
  const rows = data ?? []
  const counts = new Map<string, number>()
  if (rows.length) {
    const { data: links } = await db.from('plot_layout_links').select('layout_id').eq('org_id', orgId).in('layout_id', rows.map((r) => r.id))
    for (const l of links ?? []) counts.set(l.layout_id, (counts.get(l.layout_id) ?? 0) + 1)
  }
  // Maps made from a document: count the published version's plots and confirmed links instead.
  const versionIds = rows.map((r) => r.published_version_id).filter(Boolean) as string[]
  const vPlots = new Map<string, number>(), vLinked = new Map<string, number>()
  if (versionIds.length) {
    const { data: shapes } = await db.from('plot_map_shapes').select('version_id, unit_id').eq('org_id', orgId).in('version_id', versionIds).limit(20_000)
    for (const sh of shapes ?? []) {
      vPlots.set(sh.version_id, (vPlots.get(sh.version_id) ?? 0) + 1)
      if (sh.unit_id) vLinked.set(sh.version_id, (vLinked.get(sh.version_id) ?? 0) + 1)
    }
  }
  return rows.map((r) => ({
    id: r.id, projectId: r.project_id, name: r.name, status: r.status as 'draft' | 'published', shareEnabled: r.share_enabled, showPrices: r.show_prices,
    embedDomains: r.embed_domains ?? [], shareToken: r.share_token,
    plots: r.published_version_id ? vPlots.get(r.published_version_id) ?? 0 : ((r.geometry as unknown as LayoutGeometry)?.shapes ?? []).filter((s) => s.key).length,
    linked: r.published_version_id ? vLinked.get(r.published_version_id) ?? 0 : counts.get(r.id) ?? 0,
    publishedAt: r.published_at, updatedAt: r.updated_at,
  }))
}

async function projectUnits(orgId: string, projectId: string) {
  const { data } = await createServiceClient().from('inventory_items').select('id, unit_number').eq('org_id', orgId).eq('project_id', projectId).limit(10_000)
  return data ?? []
}

/** Upload a layout (new, or a new drawing for an existing one). Parsed, matched to the project's units, saved. */
export async function saveLayout(
  orgId: string, projectId: string, actorId: string, input: { id?: string; name: string; svg: string },
): Promise<DalResult<{ id: string; report: MatchReport; warnings: string[]; plots: number }>> {
  const db = createServiceClient()
  const { data: project } = await db.from('projects').select('id').eq('org_id', orgId).eq('id', projectId).maybeSingle()
  if (!project) return { success: false, error: 'Project not found.', status: 404 }
  let parsed
  try { parsed = parseLayoutSvg(input.svg) } catch (e) {
    return { success: false, error: e instanceof LayoutError ? e.message : 'The file could not be read as an SVG drawing.', status: 400 }
  }
  const report = matchShapes(parsed.keys, await projectUnits(orgId, projectId))
  const geometry = { shapes: parsed.shapes, labels: parsed.labels } as unknown as Json
  const row = { name: input.name.trim(), view_box: parsed.viewBox, geometry, updated_by: actorId }
  const { data, error } = input.id
    ? await db.from('plot_layouts').update(row).eq('org_id', orgId).eq('project_id', projectId).eq('id', input.id).select('id').maybeSingle()
    : await db.from('plot_layouts').insert({ ...row, org_id: orgId, project_id: projectId, created_by: actorId }).select('id').single()
  if (error?.code === '23505') return { success: false, error: 'This project already has a layout with that name.', status: 409 }
  if (error || !data) return { success: false, error: error ? 'Could not save the layout.' : 'Layout not found.', status: error ? 500 : 404 }
  // Links follow the drawing: replaced on every upload.
  await db.from('plot_layout_links').delete().eq('org_id', orgId).eq('layout_id', data.id)
  if (report.links.length) {
    const { error: linkError } = await db.from('plot_layout_links')
      .insert(report.links.map((l) => ({ layout_id: data.id, org_id: orgId, shape_key: l.shapeKey, unit_id: l.unitId })))
    if (linkError) return { success: false, error: 'Saved the drawing, but could not link its plots to units.', status: 500 }
  }
  return { success: true, data: { id: data.id, report, warnings: parsed.warnings, plots: parsed.keys.length } }
}

export async function updateLayout(
  orgId: string, layoutId: string, actorId: string, change: { publish?: boolean; share?: boolean; showPrices?: boolean; name?: string; embedDomains?: string[] },
): Promise<DalResult<LayoutSummary>> {
  const db = createServiceClient()
  const { data: cur } = await db.from('plot_layouts').select('id, status, share_token').eq('org_id', orgId).eq('id', layoutId).maybeSingle()
  if (!cur) return { success: false, error: 'Layout not found.', status: 404 }
  const patch: { updated_by: string; name?: string; status?: string; published_at?: string; share_enabled?: boolean; share_token?: string; show_prices?: boolean; embed_domains?: string[] } = { updated_by: actorId }
  if (change.name !== undefined) patch.name = change.name.trim()
  if (change.publish !== undefined) {
    patch.status = change.publish ? 'published' : 'draft'
    if (change.publish && cur.status !== 'published') patch.published_at = new Date().toISOString()
    if (!change.publish) patch.share_enabled = false // an unpublished map is never public
  }
  if (change.share !== undefined) {
    const published = (patch.status ?? cur.status) === 'published'
    if (change.share && !published) return { success: false, error: 'Publish the map before sharing it.', status: 400 }
    patch.share_enabled = change.share
    // 256 random bits: the link is the only key to the public map.
    if (change.share && !cur.share_token) patch.share_token = crypto.randomBytes(32).toString('base64url')
  }
  if (change.showPrices !== undefined) patch.show_prices = change.showPrices
  if (change.embedDomains !== undefined) {
    const parsed = parseEmbedDomains(change.embedDomains)
    if (!parsed.ok) return { success: false, error: parsed.error, status: 400 }
    patch.embed_domains = parsed.origins
  }
  const { error } = await db.from('plot_layouts').update(patch).eq('org_id', orgId).eq('id', layoutId)
  if (error?.code === '23505') return { success: false, error: 'This project already has a layout with that name.', status: 409 }
  if (error) return { success: false, error: 'Could not update the layout.', status: 500 }
  const all = await listLayouts(orgId)
  return { success: true, data: all.find((l) => l.id === layoutId)! }
}

/** A new share link; the old one stops working at once. */
export async function rotateShareLink(orgId: string, layoutId: string): Promise<boolean> {
  const { data } = await createServiceClient().from('plot_layouts').update({ share_token: crypto.randomBytes(32).toString('base64url') })
    .eq('org_id', orgId).eq('id', layoutId).select('id').maybeSingle()
  return !!data
}

/** The project a layout belongs to (organisation-scoped), or null. */
export async function layoutProject(orgId: string, layoutId: string): Promise<string | null> {
  const { data } = await createServiceClient().from('plot_layouts').select('project_id').eq('org_id', orgId).eq('id', layoutId).maybeSingle()
  return data?.project_id ?? null
}

export async function deleteLayout(orgId: string, layoutId: string): Promise<boolean> {
  const { data } = await createServiceClient().from('plot_layouts').delete().eq('org_id', orgId).eq('id', layoutId).select('id').maybeSingle()
  return !!data
}

export interface LiveLayout {
  id: string; name: string; projectId: string; viewBox: string; geometry: LayoutGeometry
  /** shape key → the unit it is, with its live status. */
  plots: Record<string, PlotInfo>
  /** A map drawn on a page image (published version, 20260083): the image behind the plots. */
  image?: { href: string; width: number; height: number }
  /** The published version shown, if the map comes from an uploaded document. */
  versionId?: string
  /** Internal: storage path of the page image (never sent to the browser). */
  imagePath?: string
}

type LayoutRow = { id: string; name: string; project_id: string; view_box: string; geometry: unknown; published_version_id?: string | null }

async function unitsById(orgId: string, ids: string[]) {
  const db = createServiceClient()
  const units = new Map<string, UnitRow>()
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await db.from('inventory_items').select(UNIT_COLUMNS).eq('org_id', orgId).in('id', ids.slice(i, i + 500))
    for (const u of (data ?? []) as UnitRow[]) units.set(u.id, u)
  }
  return units
}

/** The map as the team or buyers see it: the published version (page image + drawn plots) when there is one,
 *  otherwise the uploaded SVG drawing. Statuses always come live from inventory_items. */
async function liveFrom(orgId: string, layout: LayoutRow, withPrice: boolean): Promise<LiveLayout> {
  if (layout.published_version_id) {
    const g = await publishedVersionGeometry(orgId, layout.published_version_id)
    if (g) {
      const units = await unitsById(orgId, Object.values(g.links))
      const plots: Record<string, PlotInfo> = {}
      for (const [label, unitId] of Object.entries(g.links)) { const u = units.get(unitId); if (u) plots[label] = toInfo(u, withPrice) }
      return {
        id: layout.id, name: layout.name, projectId: layout.project_id, viewBox: g.viewBox,
        geometry: { shapes: g.shapes as unknown as LayoutShape[], labels: g.labels }, plots,
        image: { href: '', width: g.image.width, height: g.image.height }, versionId: layout.published_version_id, imagePath: g.image.path,
      }
    }
  }
  return withUnits(orgId, layout, withPrice)
}

async function withUnits(orgId: string, layout: { id: string; name: string; project_id: string; view_box: string; geometry: unknown }, withPrice: boolean): Promise<LiveLayout> {
  const db = createServiceClient()
  const { data: links } = await db.from('plot_layout_links').select('shape_key, unit_id').eq('org_id', orgId).eq('layout_id', layout.id)
  const ids = (links ?? []).map((l) => l.unit_id)
  const units = new Map<string, UnitRow>()
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await db.from('inventory_items').select(UNIT_COLUMNS).eq('org_id', orgId).in('id', ids.slice(i, i + 500))
    for (const u of (data ?? []) as UnitRow[]) units.set(u.id, u)
  }
  const plots: Record<string, PlotInfo> = {}
  for (const l of links ?? []) { const u = units.get(l.unit_id); if (u) plots[l.shape_key] = toInfo(u, withPrice) }
  return { id: layout.id, name: layout.name, projectId: layout.project_id, viewBox: layout.view_box, geometry: layout.geometry as LayoutGeometry, plots }
}

/** For the workspace (team members who can see the project). Prices included; the page image by a 10-minute link. */
export async function getLiveLayout(orgId: string, layoutId: string): Promise<LiveLayout | null> {
  const { data } = await createServiceClient().from('plot_layouts').select('id, name, project_id, view_box, geometry, published_version_id').eq('org_id', orgId).eq('id', layoutId).maybeSingle()
  if (!data) return null
  const live = await liveFrom(orgId, data, true)
  if (live.image && live.imagePath) live.image.href = (await versionImageUrl(live.imagePath)) ?? ''
  delete live.imagePath
  return live
}

export interface SharedLayout extends LiveLayout {
  projectName: string; orgName: string; contactPhone: string | null; showPrices: boolean
  /** Server-only: the developer's workspace (for lead intake). Never sent to the browser. */
  orgId: string
}

/** The public map behind a share link, or null (unknown, unshared, unpublished, or the project's add-on not active all look the same). */
export async function openSharedLayout(token: string): Promise<SharedLayout | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  const db = createServiceClient()
  const { data: layout } = await db.from('plot_layouts').select('id, org_id, name, project_id, view_box, geometry, show_prices, published_version_id')
    .eq('share_token', token).eq('share_enabled', true).eq('status', 'published').maybeSingle()
  if (!layout) return null
  if ((await getProjectAddon(layout.org_id, layout.project_id, 'plot_maps')).state !== 'active') return null
  const [live, { data: project }, { data: org }, { data: biz }] = await Promise.all([
    liveFrom(layout.org_id, layout, layout.show_prices),
    db.from('projects').select('name').eq('org_id', layout.org_id).eq('id', layout.project_id).maybeSingle(),
    db.from('organisations').select('name').eq('id', layout.org_id).maybeSingle(),
    db.from('org_business_profiles').select('phone, legal_name').eq('org_id', layout.org_id).maybeSingle(),
  ])
  // Buyers see a plot as available, reserved or sold — never the internal reason (blocked, on hold).
  // …and never internal ids: the public page does not need them.
  for (const p of Object.values(live.plots)) { p.status = publicStatus(p.status); p.unitId = '' }
  // The page image goes to buyers only through the token route, never as a storage link.
  if (live.image) live.image.href = `/api/public/plot-maps/${token}/image`
  return { ...live, orgId: layout.org_id, projectName: project?.name ?? '', orgName: biz?.legal_name || org?.name || '', contactPhone: biz?.phone ?? null, showPrices: layout.show_prices }
}

export function publicStatus(status: string): 'available' | 'reserved' | 'sold' {
  if (status === 'available') return 'available'
  if (status === 'booked' || status === 'sold') return 'sold'
  return 'reserved'
}
