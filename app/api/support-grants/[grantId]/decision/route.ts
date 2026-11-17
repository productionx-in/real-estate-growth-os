// A customer owner or admin approves or denies a support access request for their organisation.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { decideSupportAccess, getGrant } from '@/lib/dal/support-access'

const Schema = z.object({ approve: z.boolean(), note: z.string().trim().max(500).optional() })

export async function POST(request: NextRequest, { params }: { params: Promise<{ grantId: string }> }) {
  const { grantId } = await params
  if (!z.string().uuid().safeParse(grantId).success) return NextResponse.json({ error: 'Invalid request id' }, { status: 400 })
  const grant = await getGrant(grantId)
  if (!grant) return NextResponse.json({ error: 'Request not found.' }, { status: 404 })

  const access = await authorizeOrgAccess(grant.org_id, ['owner', 'admin'])
  if (!access.success) return access.response

  const parsed = Schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const result = await decideSupportAccess({
    grantId, profileId: access.context.profile.id, userId: access.context.user.id, label: access.context.profile.full_name,
    approve: parsed.data.approve, note: parsed.data.note,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ success: true, ...result.data })
}
