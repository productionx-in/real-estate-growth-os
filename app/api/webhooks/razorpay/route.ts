// app/api/webhooks/razorpay/route.ts — Razorpay events (same URL and secret as before). The X-Razorpay-Signature
// header is checked over the raw body with RAZORPAY_WEBHOOK_SECRET before anything is parsed; without the secret every
// call is refused (503). Each event is stored once (unique event id) and processed once: payments, failures, refunds
// and disputes. Settlement is idempotent, so retries and the browser's confirmation never double up.
import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { envResolver } from '@/lib/payments/registry'
import { handleWebhook } from '@/lib/payments/service'

export async function POST(request: NextRequest) {
  const raw = await request.text()
  const r = await handleWebhook(createServiceClient(), envResolver().get('razorpay'), raw, request.headers)
  return NextResponse.json(r.body, { status: r.status })
}
