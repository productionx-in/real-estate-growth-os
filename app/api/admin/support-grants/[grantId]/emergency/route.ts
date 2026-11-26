// Emergency access without the customer's approval: super admin, MFA, written reason, at most 60 minutes.
// Shown to the customer in their audit log and support-access page, and revocable by them.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authenticatePlatformAdmin, logPlatformAction } from '@/lib/auth/platform'
import { emergencySupportAccess, EMERGENCY_MAX_MINUTES, getGrant } from '@/lib/dal/support-access'
import { requestOrigin } from '@/lib/dal/org-audit'

const Schema = z.object({
  reason: z.string().trim().min(20, 'Emergency access needs a reason of at least 20 characters').max(1000),
  minutes: z.number().int().min(15).max(EMERGENCY_MAX_MINUTES),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ grantId: string }> }) {
  const authResult = await authenticatePlatformAdmin(['super_admin'], true)
  if (!authResult.success) return authResult.response
  const { auth } = authResult
  const { grantId } = await params
  if (!z.string().uuid().safeParse(grantId).success) return NextResponse.json({ error: 'Invalid request id' }, { status: 400 })

  const parsed = Schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })

  const result = await emergencySupportAccess({
    grantId, userId: auth.user.id, label: `${auth.profile.full_name} (RE by PX super admin)`, reason: parsed.data.reason, minutes: parsed.data.minutes,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  const grant = await getGrant(grantId)
  const origin = requestOrigin(request)
  await logPlatformAction({
    actorUserId: auth.user.id, actorRole: auth.platformUser.role, action: 'support.emergency_access',
    targetEntityType: 'organisation', targetEntityId: grant?.org_id ?? grantId,
    metadata: { grant_id: grantId, reason: parsed.data.reason, minutes: parsed.data.minutes, expires_at: result.data.expires_at },
    ipAddress: origin.ipAddress ?? undefined, userAgent: origin.userAgent ?? undefined,
  })
  return NextResponse.json({ success: true, ...result.data })
}
