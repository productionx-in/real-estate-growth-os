// app/api/leads/[leadId]/tags/route.ts — replace a lead's tags. Anyone who works the lead (canWorkLead:
// managers any lead, a team lead the team's, a salesperson their own, post-sales booked customers).
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeLeadWork } from '@/lib/follow-ups/auth'
import { normalizeTags } from '@/lib/leads/tags'
import { createServiceClient } from '@/lib/supabase/server'

type Ctx = { params: Promise<{ leadId: string }> }
const Body = z.object({ tags: z.array(z.string().max(60)).max(30) })

export async function PUT(request: NextRequest, { params }: Ctx) {
  const { leadId } = await params
  if (!z.string().uuid().safeParse(leadId).success) return NextResponse.json({ error: 'Invalid lead' }, { status: 400 })
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid tags' }, { status: 400 })
  const auth = await authorizeLeadWork(leadId)
  if (!auth.success) return auth.response
  const tags = normalizeTags(parsed.data.tags)
  const { error } = await createServiceClient().from('leads').update({ tags }).eq('id', leadId).eq('org_id', auth.context.orgId)
  if (error) return NextResponse.json({ error: 'Could not save the tags.' }, { status: 500 })
  return NextResponse.json({ tags })
}
