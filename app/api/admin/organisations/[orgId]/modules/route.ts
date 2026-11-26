// Switch a module on or off for one customer. Super admins and platform admins, MFA, reason required.
// Recorded in the customer's audit log (by the database function) and in the platform audit log.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authenticatePlatformAdmin, logPlatformAction } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'
import { MODULES } from '@/lib/auth/entitlements'
import { requestOrigin } from '@/lib/dal/org-audit'

const Schema = z.object({
  module: z.enum(Object.keys(MODULES) as [keyof typeof MODULES, ...(keyof typeof MODULES)[]]),
  enabled: z.boolean(),
  reason: z.string().trim().min(3, 'Give a reason').max(500),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const authResult = await authenticatePlatformAdmin(['super_admin', 'platform_admin'], true)
  if (!authResult.success) return authResult.response
  const { auth } = authResult
  const { orgId } = await params
  if (!z.string().uuid().safeParse(orgId).success) return NextResponse.json({ error: 'Invalid organisation id' }, { status: 400 })

  const parsed = Schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  const { module, enabled, reason } = parsed.data

  const service = createServiceClient()
  const { data, error } = await service.rpc('set_module_entitlement', {
    p_org: orgId, p_module: module, p_enabled: enabled, p_reason: reason, p_actor: auth.user.id, p_label: 'RE by PX platform team',
  })
  if (error) {
    const notFound = error.message.includes('not found')
    return NextResponse.json({ error: notFound ? 'Organisation not found' : error.message.replace(/^entitlement: /, '') }, { status: notFound ? 404 : 400 })
  }
  const origin = requestOrigin(request)
  await logPlatformAction({
    actorUserId: auth.user.id, actorRole: auth.platformUser.role, action: enabled ? 'module.enabled' : 'module.disabled',
    targetEntityType: 'organisation', targetEntityId: orgId, metadata: { module, reason },
    ipAddress: origin.ipAddress ?? undefined, userAgent: origin.userAgent ?? undefined,
  })
  return NextResponse.json({ success: true, ...(data as object) })
}
