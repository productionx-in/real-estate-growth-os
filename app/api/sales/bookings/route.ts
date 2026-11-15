// app/api/sales/bookings/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createBooking, getBookings } from '@/lib/dal/sales'
import { authorizeSalesRequest } from '@/lib/sales/auth'
import { CreateBookingSchema } from '@/lib/validations/sales'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const orgId = searchParams.get('orgId')
    const auth = await authorizeSalesRequest(orgId)
    if (!auth.success) return auth.response

    const projectId = searchParams.get('projectId') || undefined
    const inventoryId = searchParams.get('inventoryId') || undefined
    const status = searchParams.get('status') || undefined

    const bookings = await getBookings(auth.context.orgId, { projectId, inventoryId, status })
    return NextResponse.json({ data: bookings, count: bookings.length })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const auth = await authorizeSalesRequest(body.orgId)
    if (!auth.success) return auth.response

    if (auth.context.role === 'readonly') {
      return NextResponse.json({ error: 'Readonly users cannot create bookings' }, { status: 403 })
    }

    const parsed = CreateBookingSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const result = await createBooking({
      orgId: auth.context.orgId,
      projectId: parsed.data.projectId,
      inventoryId: parsed.data.inventoryId,
      leadId: parsed.data.leadId,
      blockingId: parsed.data.blockingId || null,
      channelPartnerId: parsed.data.channelPartnerId || null,
      basePrice: parsed.data.basePrice,
      additionalCharges: parsed.data.additionalCharges,
      bookingAmountReceived: parsed.data.bookingAmountReceived,
      paymentPlan: parsed.data.paymentPlan,
      remarks: parsed.data.remarks || null,
      actorProfileId: auth.context.profile.id,
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
