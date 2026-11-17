// app/api/saved-views/[viewId]/route.ts — rename, re-filter, share or delete a saved view.
// Your own views: always. A view shared with the team: its maker or a manager. Others: not found.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { deleteView, updateView } from '@/lib/dal/saved-views'

const Ref = z.object({ orgId: z.string().uuid() })
const PatchSchema = Ref.extend({
  name: z.string().trim().min(1, 'Give the view a name.').max(60, 'Keep the name under 60 characters.').optional(),
  layout: z.enum(['list', 'board']).optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
  shared: z.boolean().optional(),
})
const ViewId = z.string().uuid()

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ viewId: string }> }) {
  const { viewId } = await params
  const parsed = PatchSchema.safeParse(await request.json().catch(() => null))
  if (!ViewId.safeParse(viewId).success || !parsed.success) {
    return NextResponse.json({ error: parsed.error?.issues[0]?.message ?? 'Invalid view' }, { status: 400 })
  }
  const { orgId, ...patch } = parsed.data

  const access = await authorizeOrgAccess(orgId)
  if (!access.success) return access.response
  const { context } = access

  const result = await updateView(orgId, viewId, { role: context.role, profileId: context.profile.id }, patch)
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ view: result.data })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ viewId: string }> }) {
  const { viewId } = await params
  const parsed = Ref.safeParse({ orgId: new URL(request.url).searchParams.get('orgId') })
  if (!ViewId.safeParse(viewId).success || !parsed.success) {
    return NextResponse.json({ error: 'Invalid view' }, { status: 400 })
  }

  const access = await authorizeOrgAccess(parsed.data.orgId)
  if (!access.success) return access.response
  const { context } = access

  const result = await deleteView(parsed.data.orgId, viewId, { role: context.role, profileId: context.profile.id })
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
