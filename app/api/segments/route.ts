// app/api/segments/route.ts — create a lead segment (dynamic: filters or a starter template; fixed: an empty list or a
// snapshot of leads matching filters). Owners, admins and managers only (lib/dal/segments.ts, and the database).
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { auditMember } from '@/lib/dal/org-audit'
import { createSegment } from '@/lib/dal/segments'

const CreateSchema = z.object({
  orgId: z.string().uuid(),
  kind: z.enum(['dynamic', 'fixed']),
  name: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
  // Narrowed by segmentFilters (lib/segments/segments.ts) before anything is stored.
  filters: z.record(z.string(), z.unknown()).optional(),
  template: z.string().max(60).optional(),
  snapshotFilters: z.record(z.string(), z.unknown()).optional(),
})

export async function POST(request: NextRequest) {
  const parsed = CreateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid segment' }, { status: 400 })
  const { orgId, ...input } = parsed.data

  const access = await authorizeOrgAccess(orgId)
  if (!access.success) return access.response
  const { context } = access

  const result = await createSegment(orgId, { role: context.role, profileId: context.profile.id }, input)
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status })
  await auditMember(request, context, orgId, 'segment.created', { type: 'lead_segments', id: result.data.id },
    { name: result.data.name, kind: result.data.kind, template: result.data.template, leads_added: result.data.added })
  return NextResponse.json({ segment: result.data }, { status: 201 })
}
