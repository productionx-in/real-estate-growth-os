// app/api/admin/subscriptions/verify-payment/route.ts
// RE by PX Platform Administration: Super Admin Payment Verification & Subscription Activation
import { NextResponse, type NextRequest } from 'next/server'
import { authenticatePlatformAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'
import { z } from 'zod'

const VerifyPaymentSchema = z.object({
  orgId: z.string().uuid('Valid organization ID required'),
  subscriptionId: z.string().uuid('Valid subscription ID required'),
  invoiceNumber: z.string().min(3, 'Valid invoice number required').max(100),
  paymentReference: z.string().min(3, 'Payment reference required').max(100),
  amountCents: z.number().int().min(1, 'Amount must be greater than 0'),
  currency: z.string().length(3, 'Currency code must be exact 3-letter ISO code'),
})

export async function POST(request: NextRequest) {
  try {
    // 1. Authorize caller strictly as Platform Super Admin with MFA AAL2
    // Rejects any session without MFA AAL2 (currentLevel !== 'aal2')
    const authResult = await authenticatePlatformAdmin(['super_admin'], true)
    if (!authResult.success) {
      return authResult.response
    }

    const { auth } = authResult
    const service = createServiceClient()

    // 2. Validate payload
    const body = await request.json()
    const parsed = VerifyPaymentSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid verification specification', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { orgId, subscriptionId, invoiceNumber, paymentReference, amountCents, currency } = parsed.data

    // 3. Execute atomic payment verification and subscription activation RPC
    const { data: rpcResult, error: rpcError } = await (service.rpc as any)(
      'verify_payment_and_activate_subscription',
      {
        p_actor_auth_id: auth.user.id,
        p_org_id: orgId,
        p_subscription_id: subscriptionId,
        p_invoice_number: invoiceNumber.trim(),
        p_payment_reference: paymentReference.trim(),
        p_amount_cents: amountCents,
        p_currency: currency.toUpperCase(),
        p_ip_address: request.headers.get('x-forwarded-for') || null,
        p_user_agent: request.headers.get('user-agent') || null,
      }
    )

    if (rpcError) {
      console.error('Payment verification failed:', rpcError)
      const isConflict = rpcError.message?.toLowerCase().includes('conflict')
      const isValidation = rpcError.message?.toLowerCase().includes('validation')
      return NextResponse.json(
        { error: rpcError.message || 'Payment verification failed' },
        { status: isConflict ? 409 : isValidation ? 400 : 500 }
      )
    }

    const row = Array.isArray(rpcResult) ? rpcResult[0] : (rpcResult as any)
    if (!row?.success) {
      const errMsg = row?.error_message || 'Payment verification rejected'
      const isConflict = errMsg.toLowerCase().includes('conflict')
      const isValidation = errMsg.toLowerCase().includes('validation')
      return NextResponse.json(
        { error: errMsg },
        { status: isConflict ? 409 : isValidation ? 400 : 500 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Payment verified and subscription activated successfully.',
        subscription: {
          id: row.subscription_id,
          status: row.new_status,
          periodStart: row.period_start,
          periodEnd: row.period_end,
          paymentId: row.payment_id,
        },
      },
      { status: 200 }
    )
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('Error verifying payment:', err)
    return NextResponse.json({ error: errorMsg }, { status: 500 })
  }
}
