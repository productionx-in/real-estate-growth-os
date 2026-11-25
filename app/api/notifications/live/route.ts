// app/api/notifications/live/route.ts
// GET ?orgId=…&since=ISO → the caller's own new lead alerts since then, for the in-app banners. Any active member;
// each person only ever sees their own notifications.
import { NextResponse, type NextRequest } from 'next/server'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { getLiveAlerts } from '@/lib/dal/notifications'
import { MANAGER_ROLES } from '@/lib/leads/view-filters'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get('orgId')
  const since = new Date(request.nextUrl.searchParams.get('since') ?? '')
  if (!orgId || Number.isNaN(since.getTime())) return NextResponse.json({ error: 'orgId and since are required' }, { status: 400 })
  const auth = await authorizeOrgAccess(orgId)
  if (!auth.success) return auth.response
  const alerts = await getLiveAlerts(orgId, { profileId: auth.context.profile.id, seesAllLeads: MANAGER_ROLES.includes(auth.context.role) }, since)
  if (!alerts) return NextResponse.json({ error: 'Failed to load alerts' }, { status: 500 })
  return NextResponse.json({ data: { alerts, now: new Date().toISOString() } })
}
