// app/api/campaigns/[campaignId]/preview/route.ts — who would receive the campaign now (counts only; nothing is sent).
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { requireModule } from '@/lib/auth/entitlements'
import { previewAudience } from '@/lib/dal/campaigns'

const Id = z.string().uuid()

export async function GET(request: NextRequest, { params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params
  const orgId = new URL(request.url).searchParams.get('orgId')
  if (!Id.safeParse(campaignId).success || !Id.safeParse(orgId).success) return NextResponse.json({ error: 'Invalid campaign' }, { status: 400 })
  const access = await authorizeOrgAccess(orgId!)
  if (!access.success) return access.response
  { const gate = await requireModule(access.context.orgId, 'campaigns'); if (gate) return gate }
  const { context } = access
  const result = await previewAudience(orgId!, { role: context.role, profileId: context.profile.id }, campaignId)
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result.data)
}
