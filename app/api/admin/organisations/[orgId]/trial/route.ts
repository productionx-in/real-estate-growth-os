// app/api/admin/organisations/[orgId]/trial/route.ts — extend a customer's trial by a number of days.
// Platform Owner or finance, MFA-verified, audited. Only a subscription that is still on trial can be extended;
// paid subscriptions change through invoices and payments, never here.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authenticatePlatformAdmin, logPlatformAction } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'

const Body = z.object({ days: z.number().int().min(1).max(90), reason: z.string().trim().min(3, 'Give a reason').max(300) })

export async function POST(request: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const a = await authenticatePlatformAdmin(['super_admin', 'finance_admin'], true)
  if (!a.success) return a.response
  const { orgId } = await params
  if (!z.string().uuid().safeParse(orgId).success) return NextResponse.json({ error: 'Invalid organisation id' }, { status: 400 })
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the days and reason' }, { status: 400 })
  const db = createServiceClient()
  const { data: sub } = await db.from('org_subscriptions').select('id, status, current_period_end').eq('org_id', orgId).maybeSingle()
  if (!sub) return NextResponse.json({ error: 'This workspace has no subscription' }, { status: 404 })
  if (sub.status !== 'trial') return NextResponse.json({ error: 'Only a trial can be extended here. Paid plans change through invoices and payments.' }, { status: 409 })
  const base = Math.max(Date.now(), sub.current_period_end ? new Date(sub.current_period_end).getTime() : Date.now())
  const until = new Date(base + parsed.data.days * 86_400_000).toISOString()
  const { error } = await db.from('org_subscriptions').update({ current_period_end: until, updated_at: new Date().toISOString() }).eq('id', sub.id).eq('status', 'trial')
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  await logPlatformAction({ actorUserId: a.auth.user.id, actorRole: a.auth.platformUser.role, action: 'subscription.trial_extended', targetEntityType: 'org_subscriptions', targetEntityId: sub.id, metadata: { org_id: orgId, days: parsed.data.days, from: sub.current_period_end, to: until, reason: parsed.data.reason } })
  return NextResponse.json({ ok: true, trialEndsAt: until })
}
