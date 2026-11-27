// app/api/calendar/feed/[token]/route.ts — the calendar apps' subscription URL (no sign-in: the link is the key).
// Returns the link owner's own follow-ups and site visits, from two weeks ago to three months ahead, as iCalendar.
// Unknown, replaced or turned-off links, and people no longer in the workspace, all get the same 404.
import { NextResponse, type NextRequest } from 'next/server'
import { resolveFeed } from '@/lib/dal/calendar-feed'
import { calendarItems } from '@/lib/dal/calendar'
import { buildIcs } from '@/lib/calendar/ics'
import { checkDistributedRateLimit } from '@/lib/integrations/webhooks/rate-limiter'
import { appUrl } from '@/lib/site/urls'
import { orgTimezone } from '@/lib/dal/performance'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const raw = (await params).token.replace(/\.ics$/, '')
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!(await checkDistributedRateLimit({ key: `ics:${ip}`, limit: 120, windowMs: 60 * 60_000 })).allowed) return new NextResponse('Too many requests', { status: 429 })
  const feed = await resolveFeed(raw)
  if (!feed) return new NextResponse('Not found', { status: 404 })
  const now = new Date()
  const days: string[] = []
  for (let i = -14; i <= 90; i++) days.push(new Date(now.getTime() + i * 864e5).toISOString().slice(0, 10))
  const tz = await orgTimezone(feed.orgId)
  const { items } = await calendarItems(feed.orgId, days, tz, [feed.profileId], now)
  const base = appUrl(request.nextUrl.origin) ?? request.nextUrl.origin
  const body = buildIcs(items, { calendarName: `RE · ${feed.orgName}`, leadUrl: (id) => `${base}/${feed.orgSlug}/leads/${id}`, now })
  return new NextResponse(body, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="re-calendar.ics"', 'Cache-Control': 'private, max-age=900', 'X-Robots-Tag': 'noindex' } })
}
