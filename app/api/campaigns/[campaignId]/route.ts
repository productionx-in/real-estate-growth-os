// app/api/campaigns/[campaignId]/route.ts — edit a draft (name, segment, message) or delete a draft.
// Owners, admins and managers only; a campaign that has started cannot change (lib/dal/campaigns.ts and the database).
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { requireModule } from '@/lib/auth/entitlements'
import { auditMember } from '@/lib/dal/org-audit'
import { deleteDraft, updateDraft } from '@/lib/dal/campaigns'

const Id = z.string().uuid()
const Patch = z.object({
  orgId: z.string().uuid(),
  name: z.string().max(200).optional(),
  segmentId: z.string().uuid().nullable().optional(),
  subject: z.string().max(400).optional(),
  body: z.string().max(10000).optional(),
  waConnectionId: z.string().uuid().nullable().optional(),
  waTemplateName: z.string().max(512).nullable().optional(),
  waLanguage: z.string().max(10).nullable().optional(),
})

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params
  const parsed = Patch.safeParse(await request.json().catch(() => null))
  if (!Id.safeParse(campaignId).success || !parsed.success) return NextResponse.json({ error: parsed.error?.issues[0]?.message ?? 'Invalid campaign' }, { status: 400 })
  const { orgId, ...input } = parsed.data
  const access = await authorizeOrgAccess(orgId)
  if (!access.success) return access.response
  { const gate = await requireModule(access.context.orgId, 'campaigns'); if (gate) return gate }
  const { context } = access
  const result = await updateDraft(orgId, { role: context.role, profileId: context.profile.id }, campaignId, input)
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status })
  await auditMember(request, context, orgId, 'campaign.updated', { type: 'campaigns', id: campaignId }, { changed: Object.keys(input) })
  return NextResponse.json({ campaign: result.data })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params
  const orgId = new URL(request.url).searchParams.get('orgId')
  if (!Id.safeParse(campaignId).success || !Id.safeParse(orgId).success) return NextResponse.json({ error: 'Invalid campaign' }, { status: 400 })
  const access = await authorizeOrgAccess(orgId!)
  if (!access.success) return access.response
  { const gate = await requireModule(access.context.orgId, 'campaigns'); if (gate) return gate }
  const { context } = access
  const result = await deleteDraft(orgId!, { role: context.role, profileId: context.profile.id }, campaignId)
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status })
  await auditMember(request, context, orgId!, 'campaign.deleted', { type: 'campaigns', id: campaignId }, { name: result.data.name })
  return NextResponse.json({ ok: true })
}
