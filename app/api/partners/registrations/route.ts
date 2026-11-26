// app/api/partners/registrations/route.ts — POST: an agency owner/admin/manager registers a buyer from one of
// the agency's own leads with a partner developer, after confirming the agency may share the buyer's details.
// The buyer's name and phone are read from the lead on the server; the caller must be able to see the lead
// (authorizeLeadAccess applies the manager's team scope). The answer is the same shape whatever happened:
// submitted, already submitted, or "already registered" without saying by whom.
import { NextResponse, type NextRequest } from 'next/server'
import { authorizeLeadAccess } from '@/lib/auth/tenant'
import { MANAGEMENT_ROLES } from '@/lib/auth/permissions'
import { requireModule } from '@/lib/auth/entitlements'
import { submitRegistration } from '@/lib/dal/partners'
import { SubmitRegistration } from '@/lib/validations/partners'
import { parseJson, respond, serverError } from '@/lib/routing/http'

export async function POST(request: NextRequest) {
  try {
    const input = await parseJson(request, SubmitRegistration)
    if (!input.ok) {
      return NextResponse.json({ error: 'Confirm that your agency may share this buyer’s details, then try again.' }, { status: 400 })
    }
    const auth = await authorizeLeadAccess(input.data.agencyLeadId, [...MANAGEMENT_ROLES])
    if (!auth.success) return auth.response
    // The lead must be in the organisation the caller is acting for.
    if (auth.context.orgId !== input.data.orgId) return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    { const gate = await requireModule(auth.context.orgId, 'partners'); if (gate) return gate }
    return respond(await submitRegistration({
      agencyOrgId: auth.context.orgId, actorProfileId: auth.context.profile.id, partnershipId: input.data.partnershipId,
      projectId: input.data.projectId, agencyLeadId: input.data.agencyLeadId, note: input.data.note || null, consent: input.data.consent,
    }))
  } catch (err) {
    return serverError('submit registration', err)
  }
}
