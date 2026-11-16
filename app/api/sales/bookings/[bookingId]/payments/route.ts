// app/api/sales/bookings/[bookingId]/payments/route.ts
// API route to record customer payments against a booking
import { NextResponse, type NextRequest } from 'next/server'
import { recordBookingPayment } from '@/lib/dal/buyers'
import { authorizeSalesRequest } from '@/lib/sales/auth'
import { recordPaymentSchema } from '@/lib/validations/buyers'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ bookingId: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { bookingId } = await params
    const body = await request.json()

    const auth = await authorizeSalesRequest(body.orgId)
    if (!auth.success) return auth.response

    if (auth.context.role === 'readonly') {
      return NextResponse.json({ error: 'Readonly users cannot record payments' }, { status: 403 })
    }

    const parsed = recordPaymentSchema.safeParse({ ...body, bookingId })
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const result = await recordBookingPayment({
      orgId: auth.context.orgId,
      bookingId,
      milestoneId: parsed.data.milestoneId || null,
      amount: parsed.data.amount,
      paymentMethod: parsed.data.paymentMethod,
      referenceNumber: parsed.data.referenceNumber,
      actorId: auth.context.profile.id,
      paymentDate: parsed.data.paymentDate,
      notes: parsed.data.notes || null,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ data: result.data }, { status: 201 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
