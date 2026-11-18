// app/api/billing/invoices/[invoiceId]/checkout/route.ts — open Razorpay Checkout for one unpaid invoice.
// Owners and admins of the invoice's organisation only. The amount comes from the invoice.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeBillingAccess } from '@/lib/billing/access'
import { razorpayConfig } from '@/lib/billing/razorpay'
import { checkoutForInvoice } from '@/lib/dal/billing'

type Ctx = { params: Promise<{ invoiceId: string }> }

export async function POST(request: NextRequest, { params }: Ctx) {
  const { invoiceId } = await params
  const body = z.object({ orgId: z.string().uuid() }).safeParse(await request.json().catch(() => null))
  if (!body.success || !z.string().uuid().safeParse(invoiceId).success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const access = await authorizeBillingAccess(body.data.orgId)
  if (!access.success) return access.response

  const cfg = razorpayConfig()
  if (!cfg) return NextResponse.json({ error: 'Online payment is not set up yet. Please contact us to pay this invoice.' }, { status: 503 })

  const result = await checkoutForInvoice(cfg, body.data.orgId, invoiceId, access.context.user.id)
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({
    keyId: cfg.keyId, orderId: result.data.orderId, amount: result.data.amountPaise, currency: result.data.currency,
    invoiceNumber: result.data.invoiceNumber, email: access.context.user.email ?? null,
  })
}
