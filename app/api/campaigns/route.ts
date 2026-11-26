// app/api/campaigns/route.ts — create a campaign draft. Owners, admins and managers only (lib/dal/campaigns.ts).
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { requireModule } from '@/lib/auth/entitlements'
import { auditMember } from '@/lib/dal/org-audit'
import { createCampaign } from '@/lib/dal/campaigns'

const Body = z.object({
  orgId: z.string().uuid(),
  name: z.string().max(200),
  channel: z.enum(['email', 'whatsapp']),
  segmentId: z.string().uuid().optional(),
})

export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid campaign' }, { status: 400 })
  const { orgId, ...input } = parsed.data
  const access = await authorizeOrgAccess(orgId)
  if (!access.success) return access.response
  { const gate = await requireModule(access.context.orgId, 'campaigns'); if (gate) return gate }
  const { context } = access
  const result = await createCampaign(orgId, { role: context.role, profileId: context.profile.id }, input)
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status })
  await auditMember(request, context, orgId, 'campaign.created', { type: 'campaigns', id: result.data.id }, { name: result.data.name, channel: result.data.channel })
  return NextResponse.json({ campaign: result.data }, { status: 201 })
}
