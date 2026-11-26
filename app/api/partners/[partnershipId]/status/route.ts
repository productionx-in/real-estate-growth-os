// app/api/partners/[partnershipId]/status/route.ts — POST { orgId, action }: accept / reject (agency, on a
// request), cancel (developer, on its request), pause, resume (only the side that paused), end. Owners and
// admins of either side; partner_set_status checks the side, the state and that the partnership is theirs.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { requireModule } from '@/lib/auth/entitlements'
import { setPartnershipStatus } from '@/lib/dal/partners'
import { StatusChange } from '@/lib/validations/partners'
import { parseJson, respond, serverError } from '@/lib/routing/http'

type Ctx = { params: Promise<{ partnershipId: string }> }

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const { partnershipId } = await params
    if (!z.string().uuid().safeParse(partnershipId).success) return NextResponse.json({ error: 'Partnership not found' }, { status: 404 })
    const input = await parseJson(request, StatusChange)
    if (!input.ok) return input.response
    const auth = await authorizeOrgAccess(input.data.orgId, ['owner', 'admin'])
    if (!auth.success) return auth.response
    { const gate = await requireModule(auth.context.orgId, 'partners'); if (gate) return gate }
    return respond(await setPartnershipStatus(auth.context.orgId, auth.context.profile.id, partnershipId, input.data.action))
  } catch (err) {
    return serverError('partnership status', err)
  }
}
