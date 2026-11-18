// app/api/leads/[leadId]/requirements/route.ts — what the buyer is looking for (used for property matching).
// Managers and above, or the lead's salesperson (authorizeLeadWork).
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeLeadWork } from '@/lib/follow-ups/auth'
import { saveRequirements } from '@/lib/dal/matching'
import { CATEGORIES, CONFIGURATIONS, FACINGS } from '@/lib/matching/score'

const money = z.number().min(0).max(1e11).nullable()
const area = z.number().min(0).max(1e7).nullable()
const Schema = z.object({
  budget_min: money,
  budget_max: money,
  req_configurations: z.array(z.enum(CONFIGURATIONS)).max(10),
  req_categories: z.array(z.enum(Object.keys(CATEGORIES) as [keyof typeof CATEGORIES, ...(keyof typeof CATEGORIES)[]])).max(5),
  req_locations: z.array(z.string().trim().min(2).max(60)).max(10),
  req_facing: z.array(z.enum(FACINGS)).max(8),
  req_min_area: area,
  req_max_area: area,
})

export async function PUT(request: NextRequest, { params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params
  const parsed = Schema.safeParse(await request.json().catch(() => null))
  if (!z.string().uuid().safeParse(leadId).success || !parsed.success) {
    return NextResponse.json({ error: parsed.error?.issues[0]?.message ?? 'Invalid requirements' }, { status: 400 })
  }
  const auth = await authorizeLeadWork(leadId)
  if (!auth.success) return auth.response
  const input = { ...parsed.data, req_locations: [...new Set(parsed.data.req_locations)] }
  const result = await saveRequirements(auth.context.orgId, leadId, input)
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
