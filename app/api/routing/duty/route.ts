// app/api/routing/duty/route.ts
// GET: the caller's own duty status (null when they are in no active team).
// POST: a salesperson switches THEMSELVES on or off duty (across all their teams in the organisation).
// Only the caller's own team memberships are changed; the profile id is never taken from the request.
import { NextResponse, type NextRequest } from 'next/server'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { SALES_WRITE_ROLES } from '@/lib/auth/permissions'
import { DutyToggleSchema } from '@/lib/validations/routing'
import { getOwnDutyStatus, setOwnDutyStatus } from '@/lib/dal/routing'
import { parseJson, respond, serverError } from '@/lib/routing/http'
import { requireModule } from '@/lib/auth/entitlements'

export async function GET(request: NextRequest) {
  try {
    const orgId = request.nextUrl.searchParams.get('orgId')
    if (!orgId) return NextResponse.json({ error: 'Missing required orgId' }, { status: 400 })
    const auth = await authorizeOrgAccess(orgId)
    if (!auth.success) return auth.response
    { const gate = await requireModule(auth.context.orgId, 'routing'); if (gate) return gate }
    return respond(await getOwnDutyStatus(orgId, auth.context.profile.id))
  } catch (err) {
    return serverError('get duty status', err)
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = await parseJson(request, DutyToggleSchema)
    if (!input.ok) return input.response
    const auth = await authorizeOrgAccess(input.data.orgId, [...SALES_WRITE_ROLES])
    if (!auth.success) return auth.response
    { const gate = await requireModule(auth.context.orgId, 'routing'); if (gate) return gate }
    return respond(await setOwnDutyStatus(input.data.orgId, auth.context.profile.id, input.data.isOnDuty))
  } catch (err) {
    return serverError('set duty status', err)
  }
}
