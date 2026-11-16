// app/api/sales/bookings/[bookingId]/payments/[paymentId]/verify/route.ts
// Authorised Payment Verification API
import { NextResponse, type NextRequest } from 'next/server'
import { verifyBookingPayment } from '@/lib/dal/buyers'
import { authorizeSalesRequest } from '@/lib/sales/auth'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ bookingId: string; paymentId: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { paymentId } = await params
    const body = await request.json()

    const auth = await authorizeSalesRequest(body.orgId)
    if (!auth.success) return auth.response

    // Verification strictly requires Manager, Admin, or Owner authority
    if (auth.context.role !== 'owner' && auth.context.role !== 'admin' && auth.context.role !== 'manager') {
      return NextResponse.json(
        { error: 'Forbidden. Payment verification requires Manager or Admin authority.' },
        { status: 403 }
      )
    }

    const result = await verifyBookingPayment({
      orgId: auth.context.orgId,
      paymentId,
      actorId: auth.context.profile.id,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ data: result.data })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
