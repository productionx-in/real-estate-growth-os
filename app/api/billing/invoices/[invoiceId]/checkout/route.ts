// app/api/billing/invoices/[invoiceId]/checkout/route.ts — open checkout for one unpaid invoice with the primary
// payment provider (chosen by the Platform Owner; Razorpay today). Owners and admins of the invoice's organisation
// only. The amount comes from the invoice; the browser receives only what the provider's checkout needs.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeBillingAccess } from '@/lib/billing/access'
import { createServiceClient } from '@/lib/supabase/server'
import { envResolver } from '@/lib/payments/registry'
import { checkout } from '@/lib/payments/service'

type Ctx = { params: Promise<{ invoiceId: string }> }

export async function POST(request: NextRequest, { params }: Ctx) {
  const { invoiceId } = await params
  const body = z.object({ orgId: z.string().uuid() }).safeParse(await request.json().catch(() => null))
  if (!body.success || !z.string().uuid().safeParse(invoiceId).success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const access = await authorizeBillingAccess(body.data.orgId)
  if (!access.success) return access.response

  const db = createServiceClient()
  const { data: profile } = await db.from('profiles').select('full_name, phone').eq('id', access.context.profile.id).maybeSingle()
  const result = await checkout(db, envResolver(), {
    orgId: body.data.orgId, invoiceId, userId: access.context.user.id,
    customer: { email: access.context.user.email ?? null, phone: profile?.phone ?? null, name: profile?.full_name ?? null },
  })
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status })
  if ('alreadyPaid' in result.data) return NextResponse.json({ alreadyPaid: true })
  const d = result.data
  return NextResponse.json({
    ...d.public, orderId: d.orderId, paymentSessionId: d.checkoutSession,
    amount: d.amountPaise, currency: d.currency, invoiceNumber: d.invoiceNumber, email: access.context.user.email ?? null,
  })
}
