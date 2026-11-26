// app/api/performance/adjust/route.ts — a manual correction to someone's points (e.g. credit for a shared deal), with a
// reason. Owners and admins only; recorded in the ledger as an adjustment and in the audit log. Never touches counts.
import crypto from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { requireModule } from '@/lib/auth/entitlements'
import { auditMember } from '@/lib/dal/org-audit'
import { performanceDb } from '@/lib/dal/performance'

const Schema = z.object({ orgId: z.string().uuid(), profileId: z.string().uuid(), xp: z.number().int().min(-5000).max(5000).refine((n) => n !== 0), reason: z.string().trim().min(5).max(200) })

export async function POST(request: NextRequest) {
  const parsed = Schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Give a number of points (not zero) and a reason of at least 5 characters.' }, { status: 400 })
  const a = parsed.data
  const access = await authorizeOrgAccess(a.orgId, ['owner', 'admin'])
  if (!access.success) return access.response
  { const gate = await requireModule(access.context.orgId, 'performance'); if (gate) return gate }
  const { data, error } = await performanceDb().rpc('record_performance_event', {
    p_org: a.orgId, p_profile: a.profileId, p_lead: null, p_kind: 'adjustment', p_dedupe: `adjust:${crypto.randomUUID()}`,
    p_units: 0, p_value: 0, p_xp: a.xp, p_detail: { reason: a.reason }, p_by: access.context.profile.id,
  })
  if (error || !data) return NextResponse.json({ error: 'That person is not in this workspace.' }, { status: 400 })
  await auditMember(request, access.context, a.orgId, 'performance.points_adjusted', { type: 'profile', id: a.profileId }, { xp: a.xp, reason: a.reason })
  return NextResponse.json({ ok: true })
}
