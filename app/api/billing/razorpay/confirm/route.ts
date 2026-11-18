// app/api/billing/razorpay/confirm/route.ts — the browser reports a finished checkout. The signature is
// checked with the key secret, the payment is re-read from Razorpay, and only then is the invoice settled.
// The webhook (/api/webhooks/razorpay) settles the same payment independently; settlement is idempotent.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeBillingAccess } from '@/lib/billing/access'
import { razorpayConfig, verifyCheckoutSignature } from '@/lib/billing/razorpay'
import { confirmCheckout } from '@/lib/dal/billing'

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
  const cfg = razorpayConfig()
  if (!cfg) return NextResponse.json({ error: 'Online payment is not set up.' }, { status: 503 })
  if (!verifyCheckoutSignature(b.razorpay_order_id, b.razorpay_payment_id, b.razorpay_signature, cfg.keySecret)) {
    return NextResponse.json({ error: 'Payment could not be verified.' }, { status: 400 })
  }
  const result = await confirmCheckout(cfg, b.orgId, b.razorpay_order_id, b.razorpay_payment_id)
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result.data)
}
