// app/api/campaigns/[campaignId]/cancel/route.ts — stop a campaign (a draft, or one still sending). Owners, admins and
// managers only. Messages already sent stay sent; nothing further goes out.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { requireModule } from '@/lib/auth/entitlements'
import { auditMember } from '@/lib/dal/org-audit'
import { cancelCampaign } from '@/lib/dal/campaigns'

const Id = z.string().uuid()
const Body = z.object({ orgId: z.string().uuid() })

export async function POST(request: NextRequest, { params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!Id.safeParse(campaignId).success || !parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { orgId } = parsed.data
  const access = await authorizeOrgAccess(orgId)
  if (!access.success) return access.response
  { const gate = await requireModule(access.context.orgId, 'campaigns'); if (gate) return gate }
  const { context } = access
  const result = await cancelCampaign(orgId, { role: context.role, profileId: context.profile.id }, campaignId)
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status })
  await auditMember(request, context, orgId, 'campaign.cancelled', { type: 'campaigns', id: campaignId }, { withdrawn: result.data.withdrawn })
  return NextResponse.json(result.data)
}
