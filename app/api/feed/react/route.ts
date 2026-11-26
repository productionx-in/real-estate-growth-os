// app/api/feed/react/route.ts — add or remove a reaction on a feed item (20260101). Only where reactions are on, only by
// someone who can see the feed, and only on an item that is in this workspace's feed.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { isManagement } from '@/lib/auth/permissions'
import { getGamification } from '@/lib/dal/performance'
import { getFeed, toggleReaction } from '@/lib/dal/feed'
import { ITEM_KEY, REACTIONS, canSeeFeed, seesAmounts } from '@/lib/feed/items'

const Body = z.object({ orgId: z.string().uuid(), itemKey: z.string().regex(ITEM_KEY), kind: z.enum(Object.keys(REACTIONS) as [keyof typeof REACTIONS, ...(keyof typeof REACTIONS)[]]) })

export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { orgId, itemKey, kind } = parsed.data
  const access = await authorizeOrgAccess(orgId, ['owner', 'admin', 'manager', 'team_lead', 'sales_exec'])
  if (!access.success) return access.response
  const s = await getGamification(orgId)
  const manager = isManagement(access.context.role)
  if (!canSeeFeed(s, manager) || !s.feed.reactions) return NextResponse.json({ error: 'Reactions are switched off.' }, { status: 403 })
  // The item must be one this person can see in this workspace's feed.
  const items = await getFeed(orgId, access.context.profile.id, { amounts: seesAmounts(s, manager), leaderboard: manager || s.leaderboard.visibleTo === 'everyone', limit: 500, days: 60 })
  if (!items.some((i) => i.key === itemKey)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const on = await toggleReaction(orgId, itemKey, access.context.profile.id, kind)
  return NextResponse.json({ ok: true, on })
}
