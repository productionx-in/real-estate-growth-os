// app/api/feed/route.ts — the sales activity feed (20260101) for the page to refresh itself. Only for people the
// workspace lets see it (Performance → Targets & settings → Activity feed); booking values only where allowed.
import { NextResponse, type NextRequest } from 'next/server'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { isManagement } from '@/lib/auth/permissions'
import { getGamification } from '@/lib/dal/performance'
import { getFeed } from '@/lib/dal/feed'
import { canSeeFeed, seesAmounts } from '@/lib/feed/items'

export async function GET(request: NextRequest) {
  const orgId = request.nextUrl.searchParams.get('orgId') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const access = await authorizeOrgAccess(orgId, ['owner', 'admin', 'manager', 'team_lead', 'sales_exec'])
  if (!access.success) return access.response
  const s = await getGamification(orgId)
  const manager = isManagement(access.context.role)
  if (!canSeeFeed(s, manager)) return NextResponse.json({ error: 'The activity feed is not available to you.' }, { status: 403 })
  const items = await getFeed(orgId, access.context.profile.id, { amounts: seesAmounts(s, manager), leaderboard: manager || s.leaderboard.visibleTo === 'everyone' })
  return NextResponse.json({ items, reactions: s.feed.reactions }, { headers: { 'Cache-Control': 'no-store' } })
}
