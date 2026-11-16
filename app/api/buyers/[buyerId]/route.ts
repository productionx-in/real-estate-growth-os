// app/api/buyers/[buyerId]/route.ts
// Buyer 360 Profile and History API
import { NextResponse, type NextRequest } from 'next/server'
import { getBuyer360, upsertBuyerProfile } from '@/lib/dal/buyers'
import { authorizeSalesRequest } from '@/lib/sales/auth'
import { upsertBuyerSchema } from '@/lib/validations/buyers'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ buyerId: string }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { buyerId } = await params
    const { searchParams } = new URL(request.url)
    const orgId = searchParams.get('orgId')

    const auth = await authorizeSalesRequest(orgId)
    if (!auth.success) return auth.response

    const result = await getBuyer360(buyerId, auth.context.orgId)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 404 })
    }

    return NextResponse.json({ data: result.data })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { buyerId } = await params
    const body = await request.json()

    const auth = await authorizeSalesRequest(body.orgId)
    if (!auth.success) return auth.response

    if (auth.context.role === 'readonly') {
      return NextResponse.json({ error: 'Readonly users cannot update buyer profiles' }, { status: 403 })
    }

    const parsed = upsertBuyerSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const result = await upsertBuyerProfile({
      orgId: auth.context.orgId,
      fullName: parsed.data.fullName,
      phone: parsed.data.phone,
      email: parsed.data.email || null,
      panNumber: parsed.data.panNumber || null,
      aadhaarNumberMasked: parsed.data.aadhaarNumberMasked || null,
      addressLine1: parsed.data.addressLine1 || null,
      addressLine2: parsed.data.addressLine2 || null,
      city: parsed.data.city || null,
      state: parsed.data.state || null,
      pincode: parsed.data.pincode || null,
      country: parsed.data.country,
      coBuyers: parsed.data.coBuyers,
      notes: parsed.data.notes || null,
      leadId: parsed.data.leadId || null,
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
