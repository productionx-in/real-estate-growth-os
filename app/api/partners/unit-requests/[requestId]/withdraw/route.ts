// app/api/partners/unit-requests/[requestId]/withdraw/route.ts — POST { orgId }: the agency withdraws a booking
// request the developer has not answered yet. Agency owners, admins and managers.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { MANAGEMENT_ROLES } from '@/lib/auth/permissions'
import { requireModule } from '@/lib/auth/entitlements'
import { withdrawUnitRequest } from '@/lib/dal/partners'
import { OrgOnly } from '@/lib/validations/partners'
import { parseJson, respond, serverError } from '@/lib/routing/http'

type Ctx = { params: Promise<{ requestId: string }> }

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const { requestId } = await params
    if (!z.string().uuid().safeParse(requestId).success) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    const input = await parseJson(request, OrgOnly)
    if (!input.ok) return input.response
    const auth = await authorizeOrgAccess(input.data.orgId, [...MANAGEMENT_ROLES])
    if (!auth.success) return auth.response
    { const gate = await requireModule(auth.context.orgId, 'partners'); if (gate) return gate }
    return respond(await withdrawUnitRequest(auth.context.orgId, auth.context.profile.id, requestId))
  } catch (err) {
    return serverError('withdraw unit request', err)
  }
}
