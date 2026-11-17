// app/api/sales/bookings/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createBooking, getBookings } from '@/lib/dal/sales'
import { authorizeSalesRequest } from '@/lib/sales/auth'
import { SALES_WRITE_ROLES } from '@/lib/auth/permissions'
import { requireModule } from '@/lib/auth/entitlements'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const orgId = searchParams.get('orgId')
    const auth = await authorizeSalesRequest(orgId)
    if (!auth.success) return auth.response
    { const gate = await requireModule(auth.context.orgId, 'sales'); if (gate) return gate }

    const projectId = searchParams.get('projectId') || undefined
    const status = searchParams.get('status') || undefined

    const bookings = await getBookings(auth.context.orgId, { projectId, status })
    return NextResponse.json({ data: bookings, count: bookings.length })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const auth = await authorizeSalesRequest(body.orgId, SALES_WRITE_ROLES)
    if (!auth.success) return auth.response
    { const gate = await requireModule(auth.context.orgId, 'sales'); if (gate) return gate }

    if (!body.projectId || !body.inventoryId || !body.leadId || body.basePrice === undefined || body.bookingAmountReceived === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: projectId, inventoryId, leadId, basePrice, bookingAmountReceived' },
        { status: 400 }
      )
    }

    const result = await createBooking({
      orgId: auth.context.orgId,
      projectId: body.projectId,
      inventoryId: body.inventoryId,
      leadId: body.leadId,
      blockingId: body.blockingId,
      channelPartnerId: body.channelPartnerId,
      basePrice: Number(body.basePrice),
      additionalCharges: body.additionalCharges ? Number(body.additionalCharges) : 0,
      bookingAmountReceived: Number(body.bookingAmountReceived),
      paymentPlan: body.paymentPlan,
      remarks: body.remarks,
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
