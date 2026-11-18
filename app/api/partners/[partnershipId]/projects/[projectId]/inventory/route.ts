// app/api/partners/[partnershipId]/projects/[projectId]/inventory/route.ts — GET ?orgId: the agency's view of a
// shared project's units. Only while the partnership is active and the project is shared; prices only when the
// developer chose "availability and prices" (lib/dal/partners.ts partnerInventory shapes every unit).
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { requireModule } from '@/lib/auth/entitlements'
import { partnerInventory } from '@/lib/dal/partners'
import { serverError } from '@/lib/routing/http'

type Ctx = { params: Promise<{ partnershipId: string; projectId: string }> }
const uuid = z.string().uuid()

export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const { partnershipId, projectId } = await params
    const orgId = request.nextUrl.searchParams.get('orgId')
    if (!uuid.safeParse(partnershipId).success || !uuid.safeParse(projectId).success) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!uuid.safeParse(orgId).success) return NextResponse.json({ error: 'Missing required orgId' }, { status: 400 })
    const auth = await authorizeOrgAccess(orgId!, ['owner', 'admin', 'manager'])
    if (!auth.success) return auth.response
    { const gate = await requireModule(auth.context.orgId, 'sales'); if (gate) return gate }
    const units = await partnerInventory(auth.context.orgId, partnershipId, projectId)
    if (!units) return NextResponse.json({ error: 'This project’s inventory is not shared with you.' }, { status: 404 })
    return NextResponse.json({ data: units })
  } catch (err) {
    return serverError('partner inventory', err)
  }
}
