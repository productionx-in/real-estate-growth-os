// app/api/billing/payments/return/route.ts — where a provider sends the customer back after a redirect-based payment
// (UPI apps, net banking). The signed-in owner/admin of the invoice's organisation is checked, the payment is read
// from the provider, and the customer lands on their billing page with the outcome. Nothing is trusted from the URL.
import { NextResponse, type NextRequest } from 'next/server'
import { authorizeBillingAccess } from '@/lib/billing/access'
import { createServiceClient } from '@/lib/supabase/server'
import { envResolver, type Db } from '@/lib/payments/registry'
import { confirm } from '@/lib/payments/service'

export async function GET(request: NextRequest) {
  const provider = request.nextUrl.searchParams.get('provider')
  const orderId = request.nextUrl.searchParams.get('order_id') ?? ''
  const home = new URL('/select-org', request.url)
  if ((provider !== 'cashfree' && provider !== 'razorpay') || !/^[A-Za-z0-9_-]{3,60}$/.test(orderId)) return NextResponse.redirect(home)
  const db = createServiceClient() as unknown as Db
  const { data: att } = await db.from('payment_attempts').select('org_id').eq('provider', provider).eq('provider_order_id', orderId).maybeSingle()
  if (!att) return NextResponse.redirect(home)
  const access = await authorizeBillingAccess(att.org_id)
  if (!access.success) return NextResponse.redirect(home)
  const { data: org } = await db.from('organisations').select('slug').eq('id', att.org_id).single()
  const r = await confirm(db, envResolver(), att.org_id, provider, { orderId })
  const outcome = r.success ? (r.data.status === 'pending' ? 'pending' : 'paid') : r.status === 402 ? 'failed' : 'check'
  return NextResponse.redirect(new URL(`/${org?.slug}/billing?payment=${outcome}`, request.url))
}
