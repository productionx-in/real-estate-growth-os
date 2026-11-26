// app/api/partners/unit-requests/[requestId]/review/route.ts — POST { orgId, approve, reason? }: a developer owner,
// admin or manager approves a partner's booking request (holds the unit for the developer's lead for the requested
// time) or declines it with a reason the agency sees. Repeating the same decision is harmless.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { MANAGEMENT_ROLES } from '@/lib/auth/permissions'
import { requireModule } from '@/lib/auth/entitlements'
import { reviewUnitRequest } from '@/lib/dal/partners'
import { ReviewUnitRequest } from '@/lib/validations/partners'
import { parseJson, respond, serverError } from '@/lib/routing/http'

type Ctx = { params: Promise<{ requestId: string }> }

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const { requestId } = await params
    if (!z.string().uuid().safeParse(requestId).success) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    const input = await parseJson(request, ReviewUnitRequest)
    if (!input.ok) return input.response
    const auth = await authorizeOrgAccess(input.data.orgId, [...MANAGEMENT_ROLES])
    if (!auth.success) return auth.response
    { const gate = await requireModule(auth.context.orgId, 'partners'); if (gate) return gate }
    return respond(await reviewUnitRequest(auth.context.orgId, auth.context.profile.id, requestId, input.data.approve, input.data.reason || null))
  } catch (err) {
    return serverError('review unit request', err)
  }
}
