// app/api/routing/duty/route.ts
// POST: a salesperson switches THEMSELVES on or off duty (across all their teams in the organisation).
// Only the caller's own team memberships are changed; the profile id is never taken from the request.
import { type NextRequest } from 'next/server'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { SALES_WRITE_ROLES } from '@/lib/auth/permissions'
import { DutyToggleSchema } from '@/lib/validations/routing'
import { setOwnDutyStatus } from '@/lib/dal/routing'
import { parseJson, respond, serverError } from '@/lib/routing/http'

export async function POST(request: NextRequest) {
  try {
    const input = await parseJson(request, DutyToggleSchema)
    if (!input.ok) return input.response
    const auth = await authorizeOrgAccess(input.data.orgId, [...SALES_WRITE_ROLES])
    if (!auth.success) return auth.response
    return respond(await setOwnDutyStatus(input.data.orgId, auth.context.profile.id, input.data.isOnDuty))
  } catch (err) {
    return serverError('set duty status', err)
  }
}
