// app/api/admin/support-grants/route.ts — a support agent asks a customer for time-limited, read-only access.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authenticatePlatformAdmin, logPlatformAction } from '@/lib/auth/platform'
import { requestSupportAccess, SUPPORT_DURATIONS, SUPPORT_REQUEST_ROLES } from '@/lib/dal/support-access'
import { requestOrigin } from '@/lib/dal/org-audit'

const Schema = z.object({
  orgId: z.string().uuid(),
  reason: z.string().trim().min(10, 'Explain why you need access (at least 10 characters)').max(1000),
  minutes: z.number().int().refine((m) => (SUPPORT_DURATIONS as readonly number[]).includes(m), 'Choose a listed duration'),
})

export async function POST(request: NextRequest) {
  const authResult = await authenticatePlatformAdmin([...SUPPORT_REQUEST_ROLES], true)
  if (!authResult.success) return authResult.response
  const { auth } = authResult

  const parsed = Schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })

  const label = `${auth.profile.full_name} (REGrow support)`
  const result = await requestSupportAccess({ orgId: parsed.data.orgId, userId: auth.user.id, label, reason: parsed.data.reason, minutes: parsed.data.minutes })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  const origin = requestOrigin(request)
  await logPlatformAction({
    actorUserId: auth.user.id, actorRole: auth.platformUser.role, action: 'support.access_requested',
    targetEntityType: 'organisation', targetEntityId: parsed.data.orgId,
    metadata: { grant_id: result.data.id, reason: parsed.data.reason, duration_minutes: parsed.data.minutes },
    ipAddress: origin.ipAddress ?? undefined, userAgent: origin.userAgent ?? undefined,
  })
  return NextResponse.json({ success: true, grantId: result.data.id }, { status: 201 })
}
