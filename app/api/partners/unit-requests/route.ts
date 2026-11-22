// app/api/partners/unit-requests/route.ts — booking requests from a partner agency (20260086).
// GET ?orgId&registrationId → the available units the agency may ask to hold for that buyer (shared, visible).
// POST { orgId, registrationId, inventoryId, note?, holdHours? } → ask the developer to hold the unit.
// Agency owners, admins and managers; Sales module on. The database re-checks everything.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { MANAGEMENT_ROLES } from '@/lib/auth/permissions'
import { requireModule } from '@/lib/auth/entitlements'
import { requestableUnits, requestUnit } from '@/lib/dal/partners'
import { RequestUnit } from '@/lib/validations/partners'
import { parseJson, respond, serverError } from '@/lib/routing/http'

export async function GET(request: NextRequest) {
  try {
    const orgId = request.nextUrl.searchParams.get('orgId') ?? ''
    const registrationId = request.nextUrl.searchParams.get('registrationId') ?? ''
    if (!z.string().uuid().safeParse(orgId).success || !z.string().uuid().safeParse(registrationId).success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    const auth = await authorizeOrgAccess(orgId, [...MANAGEMENT_ROLES])
    if (!auth.success) return auth.response
    { const gate = await requireModule(auth.context.orgId, 'sales'); if (gate) return gate }
    const units = await requestableUnits(auth.context.orgId, registrationId)
    if (!units) return NextResponse.json({ error: 'This buyer’s registration must be accepted and still protected, with the project’s inventory shared.' }, { status: 404 })
    return NextResponse.json({ units }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err) {
    return serverError('list requestable units', err)
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = await parseJson(request, RequestUnit)
    if (!input.ok) return input.response
    const auth = await authorizeOrgAccess(input.data.orgId, [...MANAGEMENT_ROLES])
    if (!auth.success) return auth.response
    { const gate = await requireModule(auth.context.orgId, 'sales'); if (gate) return gate }
    return respond(await requestUnit({
      agencyOrgId: auth.context.orgId, actorProfileId: auth.context.profile.id, registrationId: input.data.registrationId,
      inventoryId: input.data.inventoryId, note: input.data.note || null, holdHours: input.data.holdHours ?? null,
    }), 201)
  } catch (err) {
    return serverError('request unit', err)
  }
}
