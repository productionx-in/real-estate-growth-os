// app/api/sales/deals/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createDeal, getDeals, updateDealStage } from '@/lib/dal/sales'
import { authorizeSalesRequest } from '@/lib/sales/auth'
import { SALES_WRITE_ROLES } from '@/lib/auth/permissions'
import type { DealStage } from '@/lib/sales/types'
import { requireModule } from '@/lib/auth/entitlements'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const orgId = searchParams.get('orgId')
    const auth = await authorizeSalesRequest(orgId)
    if (!auth.success) return auth.response
    { const gate = await requireModule(auth.context.orgId, 'sales'); if (gate) return gate }

    const projectId = searchParams.get('projectId') || undefined
    const stage = (searchParams.get('stage') as DealStage) || undefined

    const deals = await getDeals(auth.context.orgId, { projectId, stage })
    return NextResponse.json({ data: deals, count: deals.length })
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

    if (!body.projectId || !body.leadId) {
      return NextResponse.json(
        { error: 'Missing required fields: projectId, leadId' },
        { status: 400 }
      )
    }

    const result = await createDeal({
      orgId: auth.context.orgId,
      projectId: body.projectId,
      leadId: body.leadId,
      inventoryId: body.inventoryId,
      channelPartnerId: body.channelPartnerId,
      assignedTo: body.assignedTo,
      stage: body.stage,
      dealValue: body.dealValue ? Number(body.dealValue) : null,
      probability: body.probability ? Number(body.probability) : undefined,
      expectedCloseDate: body.expectedCloseDate,
      notes: body.notes,
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
    const auth = await authorizeSalesRequest(body.orgId, SALES_WRITE_ROLES)
    if (!auth.success) return auth.response
    { const gate = await requireModule(auth.context.orgId, 'sales'); if (gate) return gate }

    if (!body.id || !body.stage) {
      return NextResponse.json({ error: 'Missing deal id or stage' }, { status: 400 })
    }

    const result = await updateDealStage(body.id, auth.context.orgId, body.stage, {
      lossReason: body.lossReason,
      probability: body.probability ? Number(body.probability) : undefined,
      notes: body.notes,
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
