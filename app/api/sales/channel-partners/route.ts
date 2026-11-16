// app/api/sales/channel-partners/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createChannelPartner, getChannelPartners, getCommissions } from '@/lib/dal/sales'
import { authorizeSalesRequest } from '@/lib/sales/auth'
import { CHANNEL_PARTNER_ADMIN_ROLES } from '@/lib/auth/permissions'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const orgId = searchParams.get('orgId')
    const auth = await authorizeSalesRequest(orgId)
    if (!auth.success) return auth.response

    const view = searchParams.get('view') // 'partners' or 'commissions'
    const tier = searchParams.get('tier') || undefined
    const status = searchParams.get('status') || undefined

    if (view === 'commissions') {
      const partnerId = searchParams.get('channelPartnerId') || undefined
      const commissions = await getCommissions(auth.context.orgId, { channelPartnerId: partnerId, status })
      return NextResponse.json({ data: commissions, count: commissions.length })
    }

    const partners = await getChannelPartners(auth.context.orgId, { tier, status })
    return NextResponse.json({ data: partners, count: partners.length })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const auth = await authorizeSalesRequest(body.orgId, CHANNEL_PARTNER_ADMIN_ROLES)
    if (!auth.success) return auth.response

    if (!body.firmName || !body.contactPerson || !body.phone) {
      return NextResponse.json(
        { error: 'Missing required fields: firmName, contactPerson, phone' },
        { status: 400 }
      )
    }

    const result = await createChannelPartner({
      orgId: auth.context.orgId,
      firmName: body.firmName,
      reraRegistrationNumber: body.reraRegistrationNumber,
      contactPerson: body.contactPerson,
      phone: body.phone,
      email: body.email,
      panNumber: body.panNumber,
      gstNumber: body.gstNumber,
      tier: body.tier,
      defaultCommissionRate: body.defaultCommissionRate ? Number(body.defaultCommissionRate) : undefined,
      bankDetails: body.bankDetails,
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
