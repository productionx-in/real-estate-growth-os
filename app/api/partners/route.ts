// app/api/partners/route.ts — channel partner network (PR 1).
// GET ?orgId: this organisation's partnerships (owners, admins, managers).
// POST { orgId, code }: a developer's owner/admin asks the agency with that partner code to partner.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { requireModule } from '@/lib/auth/entitlements'
import { listPartnerships, requestPartnership } from '@/lib/dal/partners'
import { normalizePartnerCode } from '@/lib/partners/rules'
import { RequestPartnership } from '@/lib/validations/partners'
import { parseJson, respond, serverError } from '@/lib/routing/http'

export async function GET(request: NextRequest) {
  try {
    const orgId = request.nextUrl.searchParams.get('orgId')
    if (!z.string().uuid().safeParse(orgId).success) return NextResponse.json({ error: 'Missing required orgId' }, { status: 400 })
    const auth = await authorizeOrgAccess(orgId!, ['owner', 'admin', 'manager'])
    if (!auth.success) return auth.response
    { const gate = await requireModule(auth.context.orgId, 'partners'); if (gate) return gate }
    return NextResponse.json({ data: await listPartnerships(auth.context.orgId) })
  } catch (err) {
    return serverError('list partnerships', err)
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = await parseJson(request, RequestPartnership)
    if (!input.ok) return input.response
    const auth = await authorizeOrgAccess(input.data.orgId, ['owner', 'admin'])
    if (!auth.success) return auth.response
    { const gate = await requireModule(auth.context.orgId, 'partners'); if (gate) return gate }
    const code = normalizePartnerCode(input.data.code)
    if (!code) return NextResponse.json({ error: 'That does not look like a partner code (RGP- and 10 letters or digits).' }, { status: 400 })
    return respond(await requestPartnership(auth.context.orgId, auth.context.profile.id, code), 201)
  } catch (err) {
    return serverError('request partnership', err)
  }
}
