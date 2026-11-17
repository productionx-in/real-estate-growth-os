// app/api/routing/rules/[ruleId]/route.ts
// PATCH: edit / enable / disable a routing rule. DELETE: remove it. Owner/admin/manager only.
import { NextResponse, type NextRequest } from 'next/server'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { ROUTING_ADMIN_ROLES } from '@/lib/auth/permissions'
import { RuleUpdateSchema } from '@/lib/validations/routing'
import { deleteRule, updateRule } from '@/lib/dal/routing'
import { parseJson, respond, serverError } from '@/lib/routing/http'
import { auditMember } from '@/lib/dal/org-audit'
import { requireModule } from '@/lib/auth/entitlements'

type Ctx = { params: Promise<{ ruleId: string }> }

export async function PATCH(request: NextRequest, { params }: Ctx) {
  try {
    const { ruleId } = await params
    const input = await parseJson(request, RuleUpdateSchema)
    if (!input.ok) return input.response
    const auth = await authorizeOrgAccess(input.data.orgId, [...ROUTING_ADMIN_ROLES])
    if (!auth.success) return auth.response
    { const gate = await requireModule(auth.context.orgId, 'routing'); if (gate) return gate }
    const result = await updateRule(ruleId, input.data)
    if (result.success) await auditMember(request, auth.context, input.data.orgId, 'routing.rule_updated', { type: 'routing_rule', id: ruleId }, { fields: Object.keys(input.data).filter((k) => k !== 'orgId') })
    return respond(result)
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
    { const gate = await requireModule(auth.context.orgId, 'routing'); if (gate) return gate }
    const result = await deleteRule(orgId, ruleId)
    if (result.success) await auditMember(request, auth.context, orgId, 'routing.rule_deleted', { type: 'routing_rule', id: ruleId })
    return respond(result)
  } catch (err) {
    return serverError('delete rule', err)
  }
}
