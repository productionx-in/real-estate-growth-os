// app/api/webhooks/razorpay/route.ts — Razorpay tells us a payment was captured. The X-Razorpay-Signature
// header is checked over the raw body with RAZORPAY_WEBHOOK_SECRET; without the secret every call is refused
// (503), never accepted. Settlement is idempotent, so retries and the browser's confirmation never double up.
import { NextResponse, type NextRequest } from 'next/server'
import { capturedPaymentFromEvent, razorpayConfig, verifyWebhookSignature } from '@/lib/billing/razorpay'
import { settlePayment } from '@/lib/dal/billing'

export async function POST(request: NextRequest) {
  const secret = razorpayConfig()?.webhookSecret
  if (!secret) return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  const raw = await request.text()
  if (raw.length > 200_000) return NextResponse.json({ error: 'Too large' }, { status: 413 })
  if (!verifyWebhookSignature(raw, request.headers.get('x-razorpay-signature'), secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }
  let event: unknown
  try { event = JSON.parse(raw) } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const payment = capturedPaymentFromEvent(event)
  if (!payment) return NextResponse.json({ ok: true, ignored: true }) // other events are not ours to act on
  const result = await settlePayment(payment.order_id!, payment.id, payment.amount, payment.currency)
  // A final refusal (not one of our orders, amount mismatch, already paid) is acknowledged so Razorpay stops
  // retrying, and logged for follow-up; an unexpected error answers 500 so Razorpay retries later.
  if (!result.success) return NextResponse.json({ ok: false, reason: result.error }, { status: result.status === 500 ? 500 : 200 })
  return NextResponse.json({ ok: true, status: result.data.status })
}
