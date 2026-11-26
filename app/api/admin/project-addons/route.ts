// app/api/admin/project-addons/route.ts — activate, suspend, resume or change the terms of a paid add-on for one
// developer project. Platform Owner only, MFA-verified, audited (platform audit log; the database also keeps
// project_addon_events). Touches RE’s commercial terms only, never the customer's layouts or inventory.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authenticatePlatformAdmin, logPlatformAction } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'
import { addonState, endOfDayIst } from '@/lib/plots/addons'
import { notifyAdmins } from '@/lib/dal/plot-map-setup'

const Body = z.object({
  orgId: z.string().uuid(),
  projectId: z.string().uuid(),
  addon: z.enum(['plot_maps']),
  action: z.enum(['activate', 'suspend', 'resume', 'save_terms', 'decline_request']),
  /** Last day of the paid period (YYYY-MM-DD, IST end of day), or null for no end date. */
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  setupFeeRupees: z.number().int().min(0).max(10_000_000).optional(),
  monthlyFeeRupees: z.number().int().min(0).max(1_000_000).optional(),
  notes: z.string().trim().max(500).optional(),
  reason: z.string().trim().max(300).optional(),
}).strict()

export async function POST(request: NextRequest) {
  const a = await authenticatePlatformAdmin(['super_admin'], true)
  if (!a.success) return a.response
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  const b = parsed.data
  const db = createServiceClient()

  const { data: project } = await db.from('projects').select('id').eq('org_id', b.orgId).eq('id', b.projectId).maybeSingle()
  if (!project) return NextResponse.json({ error: 'Project not found in this workspace.' }, { status: 404 })
  const { data: cur } = await db.from('project_addons').select('status, valid_until').eq('org_id', b.orgId).eq('project_id', b.projectId).eq('addon', b.addon).maybeSingle()
  const before = addonState(cur)

  const validUntil = b.validUntil === undefined ? undefined : b.validUntil === null ? null : endOfDayIst(b.validUntil)
  if (validUntil && new Date(validUntil).getTime() <= Date.now() && (b.action === 'activate' || b.action === 'resume')) {
    return NextResponse.json({ error: 'The end date must be in the future.' }, { status: 400 })
  }
  const terms = {
    ...(b.setupFeeRupees !== undefined && { setup_fee_paise: b.setupFeeRupees * 100 }),
    ...(b.monthlyFeeRupees !== undefined && { monthly_fee_paise: b.monthlyFeeRupees * 100 }),
    ...(b.notes !== undefined && { notes: b.notes || null }),
    ...(validUntil !== undefined && { valid_until: validUntil }),
  }

  let patch: Record<string, unknown>
  switch (b.action) {
    case 'activate': patch = { ...terms, status: 'active', status_reason: b.reason || null }; break
    case 'resume':
      if (before !== 'suspended') return NextResponse.json({ error: 'Only a suspended add-on can be resumed.' }, { status: 409 })
      patch = { ...terms, status: 'active', status_reason: b.reason || null }; break
    case 'suspend':
      if (before !== 'active' && before !== 'expired') return NextResponse.json({ error: 'Only an active or expired add-on can be suspended.' }, { status: 409 })
      if (!b.reason || b.reason.length < 5) return NextResponse.json({ error: 'Give a reason for the suspension (the customer sees it).' }, { status: 400 })
      patch = { status: 'suspended', status_reason: b.reason }; break
    case 'decline_request':
      if (before !== 'pending') return NextResponse.json({ error: 'There is no pending request.' }, { status: 409 })
      if (!cur) return NextResponse.json({ error: 'There is no pending request.' }, { status: 409 })
      { const { error } = await db.from('project_addons').delete().eq('org_id', b.orgId).eq('project_id', b.projectId).eq('addon', b.addon).eq('status', 'pending')
        if (error) return NextResponse.json({ error: 'Could not decline the request.' }, { status: 500 }) }
      patch = {}; break
    default:
      if (!cur) return NextResponse.json({ error: 'Activate the add-on first.' }, { status: 409 })
      patch = terms
  }

  if (b.action !== 'decline_request') {
    const row = { ...patch, updated_by: a.auth.user.id }
    const { error } = cur
      ? await db.from('project_addons').update(row).eq('org_id', b.orgId).eq('project_id', b.projectId).eq('addon', b.addon)
      : await db.from('project_addons').insert({ ...row, org_id: b.orgId, project_id: b.projectId, addon: b.addon })
    if (error) return NextResponse.json({ error: 'Could not save the add-on.' }, { status: 500 })
  }

  if (b.action === 'activate' || b.action === 'resume') {
    await notifyAdmins(b.orgId, b.projectId, `plot_map:${b.action}:${b.projectId}:${Date.now()}`, 'Interactive Plot Map is active',
      b.action === 'activate' ? 'Upload the approved layout on the project’s Plot map page to start the set-up.' : 'The plot map for this project is available again.')
  }
  await logPlatformAction({
    actorUserId: a.auth.user.id, actorRole: a.auth.platformUser.role, action: `addon.project_${b.action}`,
    targetEntityType: 'project', targetEntityId: b.projectId,
    metadata: { org_id: b.orgId, addon: b.addon, before, valid_until: validUntil ?? null, setup_fee_rupees: b.setupFeeRupees, monthly_fee_rupees: b.monthlyFeeRupees, reason: b.reason ?? null },
  })
  return NextResponse.json({ ok: true })
}
