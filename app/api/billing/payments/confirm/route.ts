// app/api/billing/payments/confirm/route.ts — the browser reports a finished checkout (any provider). What it sends is
// verified (Razorpay: checkout signature), then the payment is read from the provider server-to-server; only then is
// the invoice settled. The provider's webhook settles the same payment independently; settlement is idempotent.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeBillingAccess } from '@/lib/billing/access'
import { createServiceClient } from '@/lib/supabase/server'
import { envResolver } from '@/lib/payments/registry'
import { confirm } from '@/lib/payments/service'

const Body = z.object({
  orgId: z.string().uuid(),
  provider: z.enum(['razorpay', 'cashfree']),
  orderId: z.string().regex(/^[A-Za-z0-9_-]{3,60}$/),
  razorpay_order_id: z.string().optional(),
  razorpay_payment_id: z.string().regex(/^pay_[A-Za-z0-9]+$/).optional(),
  razorpay_signature: z.string().regex(/^[0-9a-f]{64}$/i).optional(),
})

export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const b = parsed.data
  const access = await authorizeBillingAccess(b.orgId)
  if (!access.success) return access.response
  const result = await confirm(createServiceClient(), envResolver(), b.orgId, b.provider, { ...b, razorpay_order_id: b.razorpay_order_id ?? b.orderId })
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result.data)
}
