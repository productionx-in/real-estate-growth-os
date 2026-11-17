// app/api/saved-views/route.ts — save the current lead filters as a named view (any active member;
// sharing it with the team needs a manager).
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { createView } from '@/lib/dal/saved-views'

const ViewSchema = z.object({
  name: z.string().trim().min(1, 'Give the view a name.').max(60, 'Keep the name under 60 characters.'),
  layout: z.enum(['list', 'board']).default('list'),
  // Validated and narrowed by normalizeFilters before it is stored.
  filters: z.record(z.string(), z.unknown()).default({}),
  shared: z.boolean().default(false),
})

const CreateSchema = ViewSchema.extend({ orgId: z.string().uuid() })

export async function POST(request: NextRequest) {
  const parsed = CreateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid view' }, { status: 400 })
  }
  const { orgId, ...input } = parsed.data

  const access = await authorizeOrgAccess(orgId)
  if (!access.success) return access.response
  const { context } = access

  const result = await createView(orgId, { role: context.role, profileId: context.profile.id }, input)
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ view: result.data }, { status: 201 })
}
