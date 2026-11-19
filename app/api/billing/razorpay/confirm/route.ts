// app/api/billing/razorpay/confirm/route.ts — kept for existing Razorpay checkouts (same request body as before).
// Delegates to the provider-independent confirmation: checkout signature verified with the key secret, payment read
// from Razorpay, then settled. The webhook (/api/webhooks/razorpay) settles the same payment independently.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeBillingAccess } from '@/lib/billing/access'
import { createServiceClient } from '@/lib/supabase/server'
import { envResolver } from '@/lib/payments/registry'
import { confirm } from '@/lib/payments/service'

const Body = z.object({
  orgId: z.string().uuid(),
  razorpay_order_id: z.string().regex(/^order_[A-Za-z0-9]+$/),
  razorpay_payment_id: z.string().regex(/^pay_[A-Za-z0-9]+$/),
  razorpay_signature: z.string().regex(/^[0-9a-f]{64}$/i),
})

export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const b = parsed.data
  const access = await authorizeBillingAccess(b.orgId)
  if (!access.success) return access.response
  const result = await confirm(createServiceClient(), envResolver(), b.orgId, 'razorpay', { ...b, orderId: b.razorpay_order_id })
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result.data)
}
