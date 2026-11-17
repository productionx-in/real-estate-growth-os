// A customer owner or admin ends support access (or turns down a pending request) at any time.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { endSupportAccess, getGrant } from '@/lib/dal/support-access'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ grantId: string }> }) {
  const { grantId } = await params
  if (!z.string().uuid().safeParse(grantId).success) return NextResponse.json({ error: 'Invalid request id' }, { status: 400 })
  const grant = await getGrant(grantId)
  if (!grant) return NextResponse.json({ error: 'Request not found.' }, { status: 404 })

  const access = await authorizeOrgAccess(grant.org_id, ['owner', 'admin'])
  if (!access.success) return access.response

  const result = await endSupportAccess({
    grantId, side: 'customer', userId: access.context.user.id, profileId: access.context.profile.id, label: access.context.profile.full_name,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ success: true, status: result.data.status })
}
