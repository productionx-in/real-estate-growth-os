// app/api/sales/blockings/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { blockInventoryUnit, releaseExpiredBlockings } from '@/lib/dal/sales'
import { authorizeSalesRequest } from '@/lib/sales/auth'
import { SALES_WRITE_ROLES } from '@/lib/auth/permissions'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const orgId = searchParams.get('orgId')
    const auth = await authorizeSalesRequest(orgId)
    if (!auth.success) return auth.response

    // Auto-release any expired blockings
    await releaseExpiredBlockings(auth.context.orgId)

    const projectId = searchParams.get('projectId') || undefined
    const status = searchParams.get('status') || undefined

    const service = createServiceClient()
    let query = service.from('inventory_blockings').select('*').eq('org_id', auth.context.orgId)

    if (projectId) query = query.eq('project_id', projectId)
    if (status) query = query.eq('status', status)

    const { data } = await query.order('created_at', { ascending: false })
    return NextResponse.json({ data: data || [], count: data?.length || 0 })
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

    if (!body.projectId || !body.inventoryId || !body.leadId || body.tokenAmount === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: projectId, inventoryId, leadId, tokenAmount' },
        { status: 400 }
      )
    }

    const result = await blockInventoryUnit({
      orgId: auth.context.orgId,
      projectId: body.projectId,
      inventoryId: body.inventoryId,
      leadId: body.leadId,
      blockedBy: body.blockedBy,
      tokenAmount: Number(body.tokenAmount),
      paymentReference: body.paymentReference,
      holdDurationHours: body.holdDurationHours,
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
