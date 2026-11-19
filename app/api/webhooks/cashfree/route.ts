// app/api/webhooks/cashfree/route.ts — Cashfree events. Signature (x-webhook-signature over timestamp + raw body,
// with the secret key) and timestamp freshness are checked before anything is parsed; without Cashfree credentials
// every call is refused (503). Events are stored once and processed once, like every provider.
import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { envResolver } from '@/lib/payments/registry'
import { handleWebhook } from '@/lib/payments/service'

export async function POST(request: NextRequest) {
  const raw = await request.text()
  const r = await handleWebhook(createServiceClient(), envResolver().get('cashfree'), raw, request.headers)
  return NextResponse.json(r.body, { status: r.status })
}
