// app/api/sales/blockings/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { blockInventoryUnit, releaseBlocking, getBlockings, releaseExpiredBlockings } from '@/lib/dal/sales'
import { authorizeSalesRequest } from '@/lib/sales/auth'
import { BlockUnitSchema, ReleaseBlockingSchema } from '@/lib/validations/sales'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const orgId = searchParams.get('orgId')
    const auth = await authorizeSalesRequest(orgId)
    if (!auth.success) return auth.response

    // Auto-release any expired blockings
    await releaseExpiredBlockings(auth.context.orgId)

    const projectId = searchParams.get('projectId') || undefined
    const inventoryId = searchParams.get('inventoryId') || undefined
    const status = searchParams.get('status') || undefined

    const blockings = await getBlockings(auth.context.orgId, { projectId, inventoryId, status })
    return NextResponse.json({ data: blockings, count: blockings.length })
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
      return NextResponse.json({ error: 'Readonly users cannot place holds' }, { status: 403 })
    }

    const parsed = BlockUnitSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const result = await blockInventoryUnit({
      orgId: auth.context.orgId,
      projectId: parsed.data.projectId,
      inventoryId: parsed.data.inventoryId,
      leadId: parsed.data.leadId,
      blockedBy: auth.context.profile.id,
      tokenAmount: parsed.data.tokenAmount,
      paymentReference: parsed.data.paymentReference || null,
      holdDurationHours: parsed.data.holdDurationHours,
      remarks: parsed.data.remarks || null,
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

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const auth = await authorizeSalesRequest(body.orgId)
    if (!auth.success) return auth.response

    if (auth.context.role === 'readonly') {
      return NextResponse.json({ error: 'Readonly users cannot release holds' }, { status: 403 })
    }

    const parsed = ReleaseBlockingSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const result = await releaseBlocking({
      blockingId: parsed.data.blockingId,
      orgId: auth.context.orgId,
      releasedBy: auth.context.profile.id,
      reason: parsed.data.reason || null,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ success: true, message: 'Hold successfully released' })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
