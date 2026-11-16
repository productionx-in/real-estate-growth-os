// app/api/sales/bookings/[bookingId]/milestones/route.ts
// Booking Payment Milestones Configuration API
import { NextResponse, type NextRequest } from 'next/server'
import { generateBookingMilestones } from '@/lib/dal/buyers'
import { authorizeSalesRequest } from '@/lib/sales/auth'
import { generateMilestonesSchema } from '@/lib/validations/buyers'

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

    // Milestone schedule configuration requires Manager, Admin, or Owner
    if (auth.context.role !== 'owner' && auth.context.role !== 'admin' && auth.context.role !== 'manager') {
      return NextResponse.json(
        { error: 'Forbidden. Configuring milestone schedules requires Manager or Admin authority.' },
        { status: 403 }
      )
    }

    const parsed = generateMilestonesSchema.safeParse({ ...body, bookingId })
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const result = await generateBookingMilestones({
      orgId: auth.context.orgId,
      bookingId,
      milestones: parsed.data.milestones,
      actorId: auth.context.profile.id,
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
