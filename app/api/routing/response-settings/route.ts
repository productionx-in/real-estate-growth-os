// app/api/routing/response-settings/route.ts — GET (any member) / PUT (owner, admin, manager) the response rules.
import { NextResponse, type NextRequest } from 'next/server'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { ROUTING_ADMIN_ROLES } from '@/lib/auth/permissions'
import { ResponseSettingsSchema } from '@/lib/validations/follow-ups'
import { getResponseSettings, saveResponseSettings } from '@/lib/dal/follow-ups'
import { parseJson, respond, serverError } from '@/lib/routing/http'

export async function GET(request: NextRequest) {
  try {
    const orgId = request.nextUrl.searchParams.get('orgId')
    if (!orgId) return NextResponse.json({ error: 'Missing required orgId' }, { status: 400 })
    const auth = await authorizeOrgAccess(orgId)
    if (!auth.success) return auth.response
    return NextResponse.json({ data: await getResponseSettings(orgId) })
  } catch (err) {
    return serverError('get response settings', err)
  }
}

export async function PUT(request: NextRequest) {
  try {
    const input = await parseJson(request, ResponseSettingsSchema)
    if (!input.ok) return input.response
    const auth = await authorizeOrgAccess(input.data.orgId, [...ROUTING_ADMIN_ROLES])
    if (!auth.success) return auth.response
    return respond(await saveResponseSettings(input.data))
  } catch (err) {
    return serverError('save response settings', err)
  }
}
