// lib/dal/plot-map-publishing.ts — review and publishing of map versions (20260083), and the published map itself.
// State changes go only through plot_map_version_action() (order, QA-before-approval, one published version per map,
// add-on active). Who may take each step is decided here (ACTION_ROLES) and checked by the route. Submitting also
// re-runs the editor's checks on the saved plots: overlaps, duplicate numbers or units, broken outlines block review.
import { createServiceClient } from '@/lib/supabase/server'
import { centroid, isSubmittable, validateShapes, type Pt } from '@/lib/plots/geometry'
import { PLOT_MAP_BUCKET } from '@/lib/plots/files'
import type { DalResult } from '@/lib/dal/routing'
import type { MemberRole } from '@/types/database'

const db = () => createServiceClient()

export const REVIEW_ACTIONS = ['submit', 'qa_pass', 'qa_fail', 'approve', 'reject', 'publish'] as const
export type ReviewAction = (typeof REVIEW_ACTIONS)[number]
/** Managers prepare and check a map; the developer's owners and admins approve, send back and publish it. */
export const ACTION_ROLES: Record<ReviewAction, MemberRole[]> = {
  submit: ['owner', 'admin', 'manager'],
  qa_pass: ['owner', 'admin', 'manager'],
  qa_fail: ['owner', 'admin', 'manager'],
  approve: ['owner', 'admin'],
  reject: ['owner', 'admin'],
  publish: ['owner', 'admin'],
}

export async function versionAction(
  orgId: string, versionId: string, actorId: string, action: ReviewAction, comment: string | null,
): Promise<DalResult<{ status: string }>> {
  const client = db()
  const { data: v } = await client.from('plot_map_versions').select('id, project_id, status').eq('org_id', orgId).eq('id', versionId).maybeSingle()
  if (!v) return { success: false, error: 'Version not found.', status: 404 }
  if (action === 'reject' && !comment?.trim()) return { success: false, error: 'Say what needs to change before sending it back.', status: 400 }
  if (action === 'qa_fail' && !comment?.trim()) return { success: false, error: 'Describe what QA found.', status: 400 }
  if (action === 'submit') {
    const [{ data: shapes }, { data: units }] = await Promise.all([
      client.from('plot_map_shapes').select('label, kind, points, unit_id').eq('org_id', orgId).eq('version_id', versionId).limit(2000),
      client.from('inventory_items').select('id, unit_number').eq('org_id', orgId).eq('project_id', v.project_id).limit(10_000),
    ])
    const check = validateShapes(
      (shapes ?? []).map((s) => ({ label: s.label, kind: s.kind as 'polygon' | 'rect', points: s.points as unknown as Pt[], unitId: s.unit_id })),
      units ?? [],
    )
    if (!(shapes ?? []).length) return { success: false, error: 'Draw at least one plot first.', status: 400 }
    if (!isSubmittable(check)) {
      const why = check.errors[0] ?? (check.overlaps.length ? `Plots ${check.overlaps[0].join(' and ')} overlap.` : check.duplicateLabels.length ? `Plot number ${check.duplicateLabels[0]} is used twice.` : `Unit ${check.duplicateUnits[0]} is linked twice.`)
      return { success: false, error: `Fix this before review: ${why}`, status: 400 }
    }
  }
  const { data, error } = await client.rpc('plot_map_version_action', { p_org: orgId, p_version: versionId, p_actor: actorId, p_action: action, p_comment: comment?.trim() || null })
  if (error) {
    const m = error.message.match(/plot map review: (.*)/)
    if (/not active/.test(error.message)) return { success: false, error: 'The Interactive Plot Map add-on is not active for this project.', status: 403 }
    if (m) return { success: false, error: m[1].charAt(0).toUpperCase() + m[1].slice(1) + '.', status: 409 }
    return { success: false, error: 'Could not update the version.', status: 500 }
  }
  return { success: true, data: { status: String(data) } }
}

export interface ReviewEntry { versionId: string; action: string; comment: string | null; actorName: string | null; at: string }

export async function listReviews(orgId: string, projectId: string): Promise<ReviewEntry[]> {
  const { data } = await db().from('plot_map_reviews').select('version_id, action, comment, actor, created_at')
    .eq('org_id', orgId).eq('project_id', projectId).order('created_at', { ascending: false }).limit(300)
  const ids = [...new Set((data ?? []).map((r) => r.actor).filter(Boolean) as string[])]
  const { data: people } = ids.length ? await db().from('profiles').select('id, full_name').in('id', ids) : { data: [] }
  const name = new Map((people ?? []).map((p) => [p.id, p.full_name]))
  return (data ?? []).map((r) => ({ versionId: r.version_id, action: r.action, comment: r.comment, actorName: r.actor ? name.get(r.actor) ?? null : null, at: r.created_at }))
}

export async function versionProjectId(orgId: string, versionId: string): Promise<string | null> {
  const { data } = await db().from('plot_map_versions').select('project_id').eq('org_id', orgId).eq('id', versionId).maybeSingle()
  return data?.project_id ?? null
}

// ── The published version as map geometry ────────────────────────────────────────────────────────────────────

export interface VersionGeometry {
  viewBox: string
  shapes: { key: string; kind: 'polygon'; attrs: Record<string, string> }[]
  labels: { x: number; y: number; text: string; size: number }[]
  /** label → unit id (confirmed links only). */
  links: Record<string, string>
  image: { path: string; width: number; height: number }
}

/** A published version's plots in page pixels, ready for components/plots/PlotMap.tsx. */
export async function publishedVersionGeometry(orgId: string, versionId: string): Promise<VersionGeometry | null> {
  const client = db()
  const { data: v } = await client.from('plot_map_versions').select('id, status, image_path, image_width, image_height')
    .eq('org_id', orgId).eq('id', versionId).maybeSingle()
  if (!v || v.status !== 'published' || !v.image_width || !v.image_height) return null
  const { data: shapes } = await client.from('plot_map_shapes').select('label, points, unit_id').eq('org_id', orgId).eq('version_id', versionId).limit(2000)
  const W = v.image_width, H = v.image_height
  const size = Math.max(10, Math.round(Math.min(W, H) / 90))
  const out: VersionGeometry = { viewBox: `0 0 ${W} ${H}`, shapes: [], labels: [], links: {}, image: { path: v.image_path, width: W, height: H } }
  for (const s of shapes ?? []) {
    const pts = s.points as unknown as Pt[]
    out.shapes.push({ key: s.label, kind: 'polygon', attrs: { points: pts.map(([x, y]) => `${Math.round(x * W * 10) / 10},${Math.round(y * H * 10) / 10}`).join(' ') } })
    const [cx, cy] = centroid(pts)
    out.labels.push({ x: Math.round(cx * W), y: Math.round(cy * H + size / 3), text: s.label, size })
    if (s.unit_id) out.links[s.label] = s.unit_id
  }
  return out
}

/** A short-lived link to a version's page image (team pages only; buyers get it through the token route). */
export async function versionImageUrl(path: string, seconds = 600): Promise<string | null> {
  const { data } = await db().storage.from(PLOT_MAP_BUCKET).createSignedUrl(path, seconds)
  return data?.signedUrl ?? null
}

export async function readVersionImage(path: string): Promise<Blob | null> {
  const { data, error } = await db().storage.from(PLOT_MAP_BUCKET).download(path)
  return error ? null : data
}
