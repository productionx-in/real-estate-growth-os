// app/api/campaigns/[campaignId]/send/route.ts — start sending. Owners, admins and managers only; the sender confirms
// consent; recipients are frozen once and opt-outs are re-checked for every message (lib/dal/campaigns.ts).
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { auditMember } from '@/lib/dal/org-audit'
import { sendCampaign } from '@/lib/dal/campaigns'
import { checkDistributedRateLimit } from '@/lib/integrations/webhooks/rate-limiter'

const Id = z.string().uuid()
const Body = z.object({ orgId: z.string().uuid(), consent: z.literal(true, { message: 'Confirm that these people agreed to receive messages from you.' }) })

export async function POST(request: NextRequest, { params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!Id.safeParse(campaignId).success || !parsed.success) return NextResponse.json({ error: parsed.error?.issues[0]?.message ?? 'Invalid request' }, { status: 400 })
  const { orgId } = parsed.data
  const access = await authorizeOrgAccess(orgId)
  if (!access.success) return access.response
  const { context } = access
  const limit = await checkDistributedRateLimit({ key: `campaign:send:${orgId}`, limit: 10, windowMs: 60 * 60_000 })
  if (!limit.allowed) return NextResponse.json({ error: 'This workspace has started 10 campaigns in the last hour. Wait before sending another.' }, { status: 429 })
  const result = await sendCampaign(orgId, { role: context.role, profileId: context.profile.id }, campaignId, true)
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status })
  await auditMember(request, context, orgId, 'campaign.sent', { type: 'campaigns', id: campaignId }, { recipients: result.data.queued, skipped: result.data.skipped })
  return NextResponse.json(result.data)
}
