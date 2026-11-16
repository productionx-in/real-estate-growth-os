// app/api/notifications/read/route.ts
// POST { orgId, ids: uuid[] } or { orgId, all: true } → marks the caller's own notifications read.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { markRead } from '@/lib/dal/notifications'

const MarkReadSchema = z.union([
  z.object({ orgId: z.string().uuid(), ids: z.array(z.string().uuid()).min(1).max(100) }),
  z.object({ orgId: z.string().uuid(), all: z.literal(true) }),
])

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const parsed = MarkReadSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  const auth = await authorizeOrgAccess(parsed.data.orgId)
  if (!auth.success) return auth.response
  const result = await markRead(parsed.data.orgId, auth.context.profile.id, 'all' in parsed.data ? 'all' : parsed.data.ids)
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ data: result.data })
}
