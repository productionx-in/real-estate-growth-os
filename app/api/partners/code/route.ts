// app/api/partners/code/route.ts — POST { orgId }: an agency's owner/admin gets (or creates) the partner code
// that developers enter to send a partnership request.
import { type NextRequest } from 'next/server'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { requireModule } from '@/lib/auth/entitlements'
import { ensurePartnerCode } from '@/lib/dal/partners'
import { OrgOnly } from '@/lib/validations/partners'
import { parseJson, respond, serverError } from '@/lib/routing/http'

export async function POST(request: NextRequest) {
  try {
    const input = await parseJson(request, OrgOnly)
    if (!input.ok) return input.response
    const auth = await authorizeOrgAccess(input.data.orgId, ['owner', 'admin'])
    if (!auth.success) return auth.response
    { const gate = await requireModule(auth.context.orgId, 'sales'); if (gate) return gate }
    return respond(await ensurePartnerCode(auth.context.orgId, auth.context.profile.id))
  } catch (err) {
    return serverError('partner code', err)
  }
}
