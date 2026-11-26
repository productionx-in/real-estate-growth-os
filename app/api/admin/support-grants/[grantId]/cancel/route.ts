// The requester (or a super admin) withdraws a request or ends access early.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authenticatePlatformAdmin, logPlatformAction } from '@/lib/auth/platform'
import { endSupportAccess, getGrant, SUPPORT_REQUEST_ROLES } from '@/lib/dal/support-access'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ grantId: string }> }) {
  const authResult = await authenticatePlatformAdmin([...SUPPORT_REQUEST_ROLES], true)
  if (!authResult.success) return authResult.response
  const { auth } = authResult
  const { grantId } = await params
  if (!z.string().uuid().safeParse(grantId).success) return NextResponse.json({ error: 'Invalid request id' }, { status: 400 })

  const result = await endSupportAccess({ grantId, side: 'platform', userId: auth.user.id, profileId: null, label: `${auth.profile.full_name} (RE support)` })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  const grant = await getGrant(grantId)
  await logPlatformAction({
    actorUserId: auth.user.id, actorRole: auth.platformUser.role, action: `support.access_${result.data.status}`,
    targetEntityType: 'organisation', targetEntityId: grant?.org_id ?? grantId, metadata: { grant_id: grantId },
  })
  return NextResponse.json({ success: true, status: result.data.status })
}
