// app/api/billing/mandates/route.ts — automatic payments (UPI AutoPay) for an organisation's subscription.
// Owners and admins only. Refused while recurring payments are disabled (billing_settings; the database checks too).
//   POST   { orgId, maxPaise }    start a mandate; returns the provider's authorisation link
//   DELETE { orgId, mandateId }  cancel it (the provider is told first)
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeBillingAccess } from '@/lib/billing/access'
import { createServiceClient } from '@/lib/supabase/server'
import { envResolver, type Db } from '@/lib/payments/registry'
import { cancelMandate, startMandate } from '@/lib/payments/mandates'

export async function POST(request: NextRequest) {
  const b = z.object({ orgId: z.string().uuid(), maxPaise: z.number().int().min(100).max(1_00_00_000) }).safeParse(await request.json().catch(() => null))
  if (!b.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const access = await authorizeBillingAccess(b.data.orgId)
  if (!access.success) return access.response
  const db = createServiceClient() as unknown as Db
  const { data: profile } = await db.from('profiles').select('full_name, phone').eq('id', access.context.profile.id).maybeSingle()
  const r = await startMandate(db, envResolver(), { orgId: b.data.orgId, userId: access.context.user.id, maxPaise: b.data.maxPaise, customer: { email: access.context.user.email ?? null, phone: profile?.phone ?? null, name: profile?.full_name ?? null } })
  return r.success ? NextResponse.json(r.data) : NextResponse.json({ error: r.error }, { status: r.status })
}

export async function DELETE(request: NextRequest) {
  const b = z.object({ orgId: z.string().uuid(), mandateId: z.string().uuid() }).safeParse(await request.json().catch(() => null))
  if (!b.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const access = await authorizeBillingAccess(b.data.orgId)
  if (!access.success) return access.response
  const r = await cancelMandate(createServiceClient() as unknown as Db, envResolver(), { orgId: b.data.orgId, mandateId: b.data.mandateId, userId: access.context.user.id, source: 'customer', reason: 'Cancelled by the customer' })
  return r.success ? NextResponse.json(r.data) : NextResponse.json({ error: r.error }, { status: r.status })
}
