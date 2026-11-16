// app/api/routing/rules/[ruleId]/route.ts
// PATCH: edit / enable / disable a routing rule. DELETE: remove it. Owner/admin/manager only.
import { NextResponse, type NextRequest } from 'next/server'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { ROUTING_ADMIN_ROLES } from '@/lib/auth/permissions'
import { RuleUpdateSchema } from '@/lib/validations/routing'
import { deleteRule, updateRule } from '@/lib/dal/routing'
import { parseJson, respond, serverError } from '@/lib/routing/http'

type Ctx = { params: Promise<{ ruleId: string }> }

export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const { ruleId } = await params
    const input = await parseJson(request, RuleUpdateSchema)
    if (!input.ok) return input.response
    const auth = await authorizeOrgAccess(input.data.orgId, [...ROUTING_ADMIN_ROLES])
    if (!auth.success) return auth.response
    return respond(await updateRule(ruleId, input.data))
  } catch (err) {
    return serverError('update rule', err)
  }
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  try {
    const { ruleId } = await params
    const orgId = request.nextUrl.searchParams.get('orgId')
    if (!orgId) return NextResponse.json({ error: 'Missing required orgId' }, { status: 400 })
    const auth = await authorizeOrgAccess(orgId, [...ROUTING_ADMIN_ROLES])
    if (!auth.success) return auth.response
    return respond(await deleteRule(orgId, ruleId))
  } catch (err) {
    return serverError('delete rule', err)
  }
}
