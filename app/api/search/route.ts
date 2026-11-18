// app/api/search/route.ts — workspace search behind ⌘K. Any active member; results are scoped to the
// organisation and, for a sales executive, to their own leads (lib/dal/search.ts).
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { searchWorkspace } from '@/lib/dal/search'

const Query = z.object({ orgId: z.string().uuid(), q: z.string().max(200) })

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const parsed = Query.safeParse({ orgId: url.searchParams.get('orgId'), q: url.searchParams.get('q') ?? '' })
  if (!parsed.success) return NextResponse.json({ error: 'Invalid search' }, { status: 400 })

  const access = await authorizeOrgAccess(parsed.data.orgId)
  if (!access.success) return access.response
  const { context } = access

  const results = await searchWorkspace(parsed.data.orgId, { role: context.role, profileId: context.profile.id }, parsed.data.q)
  return NextResponse.json(results, { headers: { 'Cache-Control': 'private, no-store' } })
}
