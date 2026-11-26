// lib/dal/plot-map-setup.ts — Interactive Plot Map setup progress from what is recorded (lib/plots/setup.ts turns the
// facts into stages, progress and estimates), visible blockers, RE assignments, and the notifications that go with
// them. Callers authorise first: workspace members see their own projects; Platform staff see setup METADATA only
// (stages, counts, dates, blocker text) — never inventory, buyers or the map's contents.
import { createServiceClient } from '@/lib/supabase/server'
import { setupView, type SetupFacts, type SetupView, type StageKey } from '@/lib/plots/setup'
import { addonState } from '@/lib/plots/addon-states'
import type { DalResult } from '@/lib/dal/routing'

const db = () => createServiceClient()
const first = (xs: (string | null | undefined)[]) => (xs.filter(Boolean) as string[]).sort()[0] ?? null

export async function setupFacts(orgId: string, projectId: string): Promise<SetupFacts> {
  const client = db()
  const [{ data: addon }, { data: docs }, { data: vers }, { data: reviews }, { count: units }, { data: blockers }] = await Promise.all([
    client.from('project_addons').select('activated_at').eq('org_id', orgId).eq('project_id', projectId).eq('addon', 'plot_maps').maybeSingle(),
    client.from('plot_map_documents').select('kind, created_at, status, page_count').eq('org_id', orgId).eq('project_id', projectId).order('created_at').limit(200),
    client.from('plot_map_versions').select('id, status, render_status, rendered_at').eq('org_id', orgId).eq('project_id', projectId).order('version_no', { ascending: false }).limit(200),
    client.from('plot_map_reviews').select('version_id, action, created_at').eq('org_id', orgId).eq('project_id', projectId).order('created_at').limit(1000),
    client.from('inventory_items').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('project_id', projectId),
    client.from('plot_map_setup_blockers').select('id, stage, waiting_on, raised_at, resolved_at, reason').eq('org_id', orgId).eq('project_id', projectId).order('raised_at').limit(200),
  ])
  // The version being worked on: the newest one that is not superseded.
  const working = (vers ?? []).find((v) => v.status !== 'superseded') ?? null
  const { data: shapes } = working
    ? await client.from('plot_map_shapes').select('points, unit_id').eq('org_id', orgId).eq('version_id', working.id).limit(2000)
    : { data: [] }
  const rs = reviews ?? []
  const at = (action: string) => first(rs.filter((r) => r.action === action).map((r) => r.created_at))
  // "Inventory linked": the first submission of a version whose plots were all linked. Shapes are frozen from
  // submission on (20260082), so a version past review shows exactly what was submitted.
  const frozen = new Set((vers ?? []).filter((v) => !['draft', 'rejected'].includes(v.status)).map((v) => v.id))
  let linkedAt: string | null = null
  for (const id of frozen) {
    const { data: unl } = await client.from('plot_map_shapes').select('id', { count: 'exact' }).eq('org_id', orgId).eq('version_id', id).is('unit_id', null).limit(1)
    const { count: total } = await client.from('plot_map_shapes').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('version_id', id)
    if ((total ?? 0) > 0 && (unl ?? []).length === 0) {
      const sub = first(rs.filter((r) => r.version_id === id && r.action === 'submitted').map((r) => r.created_at))
      if (sub && (!linkedAt || sub < linkedAt)) linkedAt = sub
    }
  }
  const latestDoc = (docs ?? []).filter((d) => d.status === 'ready').at(-1)
  const vertexCounts = (shapes ?? []).map((s) => (s.points as unknown as unknown[]).length)
  return {
    activatedAt: addon?.activated_at ?? null,
    firstUploadAt: first((docs ?? []).map((d) => d.created_at)),
    firstRenderedAt: first((vers ?? []).filter((v) => v.render_status === 'ready').map((v) => v.rendered_at)),
    firstSubmittedAt: at('submitted'),
    linkedAt,
    qaPassedAt: at('qa_passed'),
    approvedAt: at('approved'),
    publishedAt: at('published'),
    kind: (latestDoc?.kind as SetupFacts['kind']) ?? null,
    pages: latestDoc?.page_count ?? 1,
    plots: (shapes ?? []).length,
    units: units ?? 0,
    avgVertices: vertexCounts.length ? vertexCounts.reduce((a, b) => a + b, 0) / vertexCounts.length : 4,
    unlinked: (shapes ?? []).filter((s) => !s.unit_id).length,
    blockers: (blockers ?? []).map((b) => ({ id: b.id, stage: b.stage, waitingOn: b.waiting_on as 'customer' | 'regrow', raisedAt: b.raised_at, resolvedAt: b.resolved_at, reason: b.reason })),
  }
}

export async function getSetupView(orgId: string, projectId: string): Promise<SetupView> {
  return setupView(await setupFacts(orgId, projectId))
}

// ── blockers ─────────────────────────────────────────────────────────────────────────────────────────────────

export async function raiseBlocker(
  orgId: string, projectId: string, actorUserId: string, input: { stage: StageKey; waitingOn: 'customer' | 'regrow'; reason: string },
): Promise<DalResult<{ id: string }>> {
  if (input.stage === 'activated') return { success: false, error: 'Choose the stage that is waiting.', status: 400 }
  const reason = input.reason.trim()
  if (reason.length < 5 || reason.length > 500) return { success: false, error: 'Describe what is needed (5–500 characters).', status: 400 }
  const { data, error } = await db().from('plot_map_setup_blockers')
    .insert({ org_id: orgId, project_id: projectId, stage: input.stage, waiting_on: input.waitingOn, reason, raised_by: actorUserId }).select('id').single()
  if (error || !data) return { success: false, error: error?.message.includes('another organisation') ? 'Project not found.' : 'Could not record the blocker.', status: error?.message.includes('another organisation') ? 404 : 500 }
  if (input.waitingOn === 'customer') {
    await notifyAdmins(orgId, projectId, `plot_map:blocker:${data.id}`, 'Your plot map needs something from you', reason)
  }
  return { success: true, data: { id: data.id } }
}

export async function resolveBlocker(orgId: string, blockerId: string, actorUserId: string, resolution: string | null): Promise<DalResult<null>> {
  const { data, error } = await db().from('plot_map_setup_blockers')
    .update({ resolved_at: new Date().toISOString(), resolved_by: actorUserId, resolution: resolution?.trim() || null })
    .eq('org_id', orgId).eq('id', blockerId).is('resolved_at', null).select('id').maybeSingle()
  if (error) return { success: false, error: 'Could not resolve the blocker.', status: 500 }
  if (!data) return { success: false, error: 'Blocker not found or already resolved.', status: 404 }
  return { success: true, data: null }
}

// ── notifications (in-app; e-mails come from the hourly customer e-mail job) ─────────────────────────────────

/** An in-app notification to the workspace's active owners and admins, once per dedupe key. */
export async function notifyAdmins(orgId: string, projectId: string, dedupe: string, title: string, body: string): Promise<void> {
  const client = db()
  const { data: members } = await client.from('org_members').select('profile_id').eq('org_id', orgId).eq('status', 'active').in('role', ['owner', 'admin'])
  const rows = (members ?? []).map((m) => ({
    org_id: orgId, recipient_profile_id: m.profile_id, type: 'plot_map', title: title.slice(0, 120), body: body.slice(0, 500),
    data: { project_id: projectId }, dedupe_key: dedupe,
  }))
  if (rows.length) await client.from('notifications').upsert(rows, { onConflict: 'recipient_profile_id,dedupe_key', ignoreDuplicates: true })
}

// ── the operations queue (Platform staff: metadata only) ─────────────────────────────────────────────────────

export interface QueueRow {
  orgId: string; orgName: string; projectId: string; projectName: string
  view: SetupView
  assignee: string | null
  assigneeUserId: string | null
  plots: number
  openBlockers: { id: string; stage: string; waitingOn: string; reason: string; raisedAt: string }[]
}

export async function setupQueue(): Promise<QueueRow[]> {
  const client = db()
  const { data: addons } = await client.from('project_addons').select('org_id, project_id, status, valid_until').eq('addon', 'plot_maps').limit(500)
  const active = (addons ?? []).filter((a) => addonState(a) === 'active')
  if (!active.length) return []
  const projectIds = active.map((a) => a.project_id)
  const [{ data: projects }, { data: orgs }, { data: assigns }, { data: open }] = await Promise.all([
    client.from('projects').select('id, name').in('id', projectIds),
    client.from('organisations').select('id, name').in('id', [...new Set(active.map((a) => a.org_id))]),
    client.from('plot_map_setup_assignments').select('project_id, assignee_user').in('project_id', projectIds),
    client.from('plot_map_setup_blockers').select('id, project_id, stage, waiting_on, reason, raised_at').in('project_id', projectIds).is('resolved_at', null),
  ])
  const staffIds = [...new Set((assigns ?? []).map((a) => a.assignee_user).filter(Boolean) as string[])]
  const { data: staff } = staffIds.length ? await client.from('profiles').select('auth_user_id, full_name').in('auth_user_id', staffIds) : { data: [] }
  const staffName = new Map((staff ?? []).map((s) => [s.auth_user_id as string, s.full_name || 'RE team']))
  const rows: QueueRow[] = []
  for (const a of active) {
    const facts = await setupFacts(a.org_id, a.project_id)
    const assigneeUserId = (assigns ?? []).find((x) => x.project_id === a.project_id)?.assignee_user ?? null
    rows.push({
      orgId: a.org_id, orgName: (orgs ?? []).find((o) => o.id === a.org_id)?.name ?? '',
      projectId: a.project_id, projectName: (projects ?? []).find((p) => p.id === a.project_id)?.name ?? '',
      view: setupView(facts), plots: facts.plots,
      assigneeUserId, assignee: assigneeUserId ? staffName.get(assigneeUserId) ?? 'RE team' : null,
      openBlockers: (open ?? []).filter((b) => b.project_id === a.project_id).map((b) => ({ id: b.id, stage: b.stage, waitingOn: b.waiting_on, reason: b.reason, raisedAt: b.raised_at })),
    })
  }
  // Not yet published first; overdue first; then the earliest expected completion.
  return rows.sort((x, y) => Number(x.view.completed === 8) - Number(y.view.completed === 8) || Number(y.view.overdue) - Number(x.view.overdue)
    || (x.view.estimate ?? '9').localeCompare(y.view.estimate ?? '9'))
}

export async function assignSetup(orgId: string, projectId: string, assigneeUserId: string | null, actorUserId: string): Promise<DalResult<null>> {
  const client = db()
  if (assigneeUserId) {
    const { data: s } = await client.from('platform_users').select('user_id').eq('user_id', assigneeUserId).eq('is_active', true).maybeSingle()
    if (!s) return { success: false, error: 'That person is not on the RE team.', status: 400 }
  }
  const { error } = await client.from('plot_map_setup_assignments')
    .upsert({ project_id: projectId, org_id: orgId, assignee_user: assigneeUserId, assigned_by: actorUserId, assigned_at: new Date().toISOString() }, { onConflict: 'project_id' })
  if (error) return { success: false, error: error.message.includes('another organisation') ? 'Project not found.' : 'Could not assign.', status: error.message.includes('another organisation') ? 404 : 500 }
  return { success: true, data: null }
}
