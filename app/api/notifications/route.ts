// app/api/notifications/route.ts
// GET ?orgId=… → the caller's own inbox (latest 30) and unread count. Any active member.
import { NextResponse, type NextRequest } from 'next/server'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { getInbox } from '@/lib/dal/notifications'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get('orgId')
  if (!orgId) return NextResponse.json({ error: 'Missing required orgId' }, { status: 400 })
  const auth = await authorizeOrgAccess(orgId)
  if (!auth.success) return auth.response
  const result = await getInbox(orgId, auth.context.profile.id)
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ data: result.data })
}
