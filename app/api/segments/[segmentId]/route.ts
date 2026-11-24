// app/api/segments/[segmentId]/route.ts — rename, describe, re-filter (dynamic) or delete a segment.
// Owners, admins and managers only. Deleting a segment never touches its leads.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { auditMember } from '@/lib/dal/org-audit'
import { deleteSegment, updateSegment } from '@/lib/dal/segments'

const Id = z.string().uuid()
const PatchSchema = z.object({
  orgId: z.string().uuid(),
  name: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ segmentId: string }> }) {
  const { segmentId } = await params
  const parsed = PatchSchema.safeParse(await request.json().catch(() => null))
  if (!Id.safeParse(segmentId).success || !parsed.success) {
    return NextResponse.json({ error: parsed.error?.issues[0]?.message ?? 'Invalid segment' }, { status: 400 })
  }
  const { orgId, ...patch } = parsed.data
  const access = await authorizeOrgAccess(orgId)
  if (!access.success) return access.response
  const { context } = access

  const result = await updateSegment(orgId, { role: context.role, profileId: context.profile.id }, segmentId, patch)
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status })
  await auditMember(request, context, orgId, 'segment.updated', { type: 'lead_segments', id: segmentId },
    { name: result.data.name, changed: Object.keys(patch) })
  return NextResponse.json({ segment: result.data })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ segmentId: string }> }) {
  const { segmentId } = await params
  const orgId = new URL(request.url).searchParams.get('orgId')
  if (!Id.safeParse(segmentId).success || !Id.safeParse(orgId).success) return NextResponse.json({ error: 'Invalid segment' }, { status: 400 })
  const access = await authorizeOrgAccess(orgId!)
  if (!access.success) return access.response
  const { context } = access

  const result = await deleteSegment(orgId!, { role: context.role, profileId: context.profile.id }, segmentId)
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status })
  await auditMember(request, context, orgId!, 'segment.deleted', { type: 'lead_segments', id: segmentId }, { name: result.data.name })
  return NextResponse.json({ ok: true })
}
