// app/api/admin/organisations/[orgId]/addons/route.ts — switch a paid add-on on or off for a workspace and record
// the agreed fees. Platform Owner only, MFA-verified, audited. Touches REGrow's commercial terms only, never the
// customer's business data (their layouts and inventory are theirs: uploaded and managed in the workspace).
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authenticatePlatformAdmin, logPlatformAction } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'

const Body = z.object({
  addon: z.enum(['plot_maps']),
  enabled: z.boolean(),
  setupFeeRupees: z.number().int().min(0).max(10_000_000),
  monthlyFeeRupees: z.number().int().min(0).max(1_000_000),
  includedLayouts: z.number().int().min(0).max(100),
  notes: z.string().trim().max(500).optional(),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await params
  const a = await authenticatePlatformAdmin(['super_admin'], true)
  if (!a.success) return a.response
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!z.string().uuid().safeParse(orgId).success || !parsed.success) return NextResponse.json({ error: parsed.success ? 'Invalid workspace' : parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  const b = parsed.data
  const db = createServiceClient()
  const { data: org } = await db.from('organisations').select('id').eq('id', orgId).maybeSingle()
  if (!org) return NextResponse.json({ error: 'Workspace not found.' }, { status: 404 })
  const { data: prev } = await db.from('org_addons').select('enabled, enabled_at').eq('org_id', orgId).eq('addon', b.addon).maybeSingle()
  const now = new Date().toISOString()
  const { error } = await db.from('org_addons').upsert({
    org_id: orgId, addon: b.addon, enabled: b.enabled, setup_fee_paise: b.setupFeeRupees * 100, monthly_fee_paise: b.monthlyFeeRupees * 100,
    included_layouts: b.includedLayouts, notes: b.notes || null, updated_by: a.auth.user.id, updated_at: now,
    enabled_at: b.enabled ? (prev?.enabled ? prev.enabled_at : now) : prev?.enabled_at ?? null,
  }, { onConflict: 'org_id,addon' })
  if (error) return NextResponse.json({ error: 'Could not save the add-on.' }, { status: 500 })
  await logPlatformAction({
    actorUserId: a.auth.user.id, actorRole: a.auth.platformUser.role, action: b.enabled ? 'addon.enabled' : 'addon.disabled',
    targetEntityType: 'organisation', targetEntityId: orgId,
    metadata: { addon: b.addon, setup_fee_rupees: b.setupFeeRupees, monthly_fee_rupees: b.monthlyFeeRupees, included_layouts: b.includedLayouts, was_enabled: prev?.enabled ?? false },
  })
  return NextResponse.json({ ok: true })
}
