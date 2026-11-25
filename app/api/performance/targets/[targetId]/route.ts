// app/api/performance/targets/[targetId]/route.ts — raise or lower a target, change its end date, or retire it.
// Owners and admins only. Progress is always recomputed from the ledger, so a change applies from now on without
// rewriting what people already achieved; the old value stays in the history.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { auditMember } from '@/lib/dal/org-audit'
import { performanceDb } from '@/lib/dal/performance'

const Schema = z.object({
  orgId: z.string().uuid(),
  amount: z.number().positive().max(1e12).optional(),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  archive: z.literal(true).optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ targetId: string }> }) {
  const { targetId } = await params
  const parsed = Schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success || !/^[0-9a-f-]{36}$/.test(targetId)) return NextResponse.json({ error: 'Invalid change' }, { status: 400 })
  const access = await authorizeOrgAccess(parsed.data.orgId, ['owner', 'admin'])
  if (!access.success) return access.response
  const { data: before } = await performanceDb().from('performance_targets').select('*').eq('id', targetId).eq('org_id', parsed.data.orgId).maybeSingle()
  if (!before) return NextResponse.json({ error: 'Target not found' }, { status: 404 })
  const patch: Record<string, unknown> = { updated_by: access.context.profile.id }
  if (parsed.data.amount !== undefined) {
    if (before.metric !== 'revenue' && !Number.isInteger(parsed.data.amount)) return NextResponse.json({ error: 'Counts are whole numbers.' }, { status: 400 })
    patch.amount = parsed.data.amount
  }
  if (parsed.data.endsOn !== undefined) {
    if (parsed.data.endsOn && parsed.data.endsOn < before.starts_on) return NextResponse.json({ error: 'The end date is before the start date.' }, { status: 400 })
    if (!parsed.data.endsOn && before.period === 'custom') return NextResponse.json({ error: 'Custom dates need an end date.' }, { status: 400 })
    patch.ends_on = parsed.data.endsOn
  }
  if (parsed.data.archive) patch.archived_at = new Date().toISOString()
  const { error } = await performanceDb().from('performance_targets').update(patch).eq('id', targetId).eq('org_id', parsed.data.orgId)
  if (error) return NextResponse.json({ error: 'Could not save the change.' }, { status: 500 })
  await auditMember(request, access.context, parsed.data.orgId, parsed.data.archive ? 'performance.target_archived' : 'performance.target_changed',
    { type: 'performance_target', id: targetId }, { before: { amount: before.amount, ends_on: before.ends_on }, after: patch })
  return NextResponse.json({ ok: true })
}
