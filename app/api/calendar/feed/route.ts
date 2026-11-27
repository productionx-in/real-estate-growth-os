// app/api/calendar/feed/route.ts — turn on (or replace) and turn off your own calendar subscription link for a
// workspace. Any active member, for themselves only. The link is returned once and never stored in plain text.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { auditMember } from '@/lib/dal/org-audit'
import { issueFeed, revokeFeed } from '@/lib/dal/calendar-feed'
import { appUrl } from '@/lib/site/urls'

const Body = z.object({ orgId: z.string().uuid() })

export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const access = await authorizeOrgAccess(parsed.data.orgId)
  if (!access.success) return access.response
  const token = await issueFeed(parsed.data.orgId, access.context.profile.id)
  if (!token) return NextResponse.json({ error: 'Could not create the link.' }, { status: 500 })
  await auditMember(request, access.context, parsed.data.orgId, 'calendar_feed.issued', { type: 'profile', id: access.context.profile.id }, {})
  const base = appUrl(request.nextUrl.origin) ?? request.nextUrl.origin
  return NextResponse.json({ url: `${base}/api/calendar/feed/${token}` })
}

export async function DELETE(request: NextRequest) {
  const parsed = Body.safeParse({ orgId: request.nextUrl.searchParams.get('orgId') })
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const access = await authorizeOrgAccess(parsed.data.orgId)
  if (!access.success) return access.response
  await revokeFeed(parsed.data.orgId, access.context.profile.id)
  await auditMember(request, access.context, parsed.data.orgId, 'calendar_feed.revoked', { type: 'profile', id: access.context.profile.id }, {})
  return NextResponse.json({ ok: true })
}
