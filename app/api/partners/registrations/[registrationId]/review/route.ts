// app/api/partners/registrations/[registrationId]/review/route.ts — POST { orgId, accept, reason? }: a
// developer owner/admin/manager accepts (creates the developer's own lead; protection starts now) or rejects
// (reason required) a registration made to them. Repeating the same decision is harmless.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { MANAGEMENT_ROLES } from '@/lib/auth/permissions'
import { requireModule } from '@/lib/auth/entitlements'
import { reviewRegistration } from '@/lib/dal/partners'
import { ReviewRegistration } from '@/lib/validations/partners'
import { parseJson, respond, serverError } from '@/lib/routing/http'

type Ctx = { params: Promise<{ registrationId: string }> }

export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const { registrationId } = await params
    if (!z.string().uuid().safeParse(registrationId).success) return NextResponse.json({ error: 'Registration not found' }, { status: 404 })
    const input = await parseJson(request, ReviewRegistration)
    if (!input.ok) return input.response
    const auth = await authorizeOrgAccess(input.data.orgId, [...MANAGEMENT_ROLES])
    if (!auth.success) return auth.response
    { const gate = await requireModule(auth.context.orgId, 'partners'); if (gate) return gate }
    return respond(await reviewRegistration(auth.context.orgId, auth.context.profile.id, registrationId, input.data.accept, input.data.reason || null))
  } catch (err) {
    return serverError('review registration', err)
  }
}
