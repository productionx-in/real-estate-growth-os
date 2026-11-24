// app/api/segments/[segmentId]/leads/route.ts — add leads to, or remove them from, a fixed list.
// Owners, admins and managers only; every lead must be a current lead of the same organisation.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { auditMember } from '@/lib/dal/org-audit'
import { addToList, removeFromList } from '@/lib/dal/segments'

const Id = z.string().uuid()
const Body = z.object({ orgId: z.string().uuid(), leadIds: z.array(z.string()).min(1).max(500) })

async function handle(request: NextRequest, segmentId: string, op: 'add' | 'remove') {
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!Id.safeParse(segmentId).success || !parsed.success) {
    return NextResponse.json({ error: parsed.error?.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  }
  const { orgId, leadIds } = parsed.data
  const access = await authorizeOrgAccess(orgId)
  if (!access.success) return access.response
  const { context } = access
  const actor = { role: context.role, profileId: context.profile.id }

  const result = op === 'add' ? await addToList(orgId, actor, segmentId, leadIds) : await removeFromList(orgId, actor, segmentId, leadIds)
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status })
  await auditMember(request, context, orgId, op === 'add' ? 'segment.leads_added' : 'segment.leads_removed',
    { type: 'lead_segments', id: segmentId }, { count: leadIds.length })
  return NextResponse.json(result.data)
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ segmentId: string }> }) {
  return handle(request, (await params).segmentId, 'add')
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ segmentId: string }> }) {
  return handle(request, (await params).segmentId, 'remove')
}
