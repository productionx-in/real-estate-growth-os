// app/api/help/route.ts — the customer side of support. Any active member can open a case for their organisation and
// follow it; owners and admins see every case of the organisation, others only their own. Staff internal notes are
// never returned. POST { orgId, subject, category, body, priority? } opens a case; POST { orgId, caseId, body } replies.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { createServiceClient } from '@/lib/supabase/server'
import { customerReply, openCase, type Db } from '@/lib/platform/portal'

const Open = z.object({
  orgId: z.string().uuid(), subject: z.string().trim().min(3).max(200), body: z.string().trim().min(5).max(8000),
  category: z.enum(['question', 'problem', 'billing', 'data_request', 'feature_request']).default('question'), priority: z.enum(['normal', 'high', 'urgent']).optional(),
})
const Reply = z.object({ orgId: z.string().uuid(), caseId: z.string().uuid(), body: z.string().trim().min(1).max(8000) })

export async function POST(request: NextRequest) {
  const raw = await request.json().catch(() => null)
  const reply = Reply.safeParse(raw), open = Open.safeParse(raw)
  if (!reply.success && !open.success) return NextResponse.json({ error: 'Check the details and try again.' }, { status: 400 })
  const orgId = reply.success ? reply.data.orgId : open.data!.orgId
  const access = await authorizeOrgAccess(orgId)
  if (!access.success) return access.response
  const db = createServiceClient() as unknown as Db
  const member = { profileId: access.context.profile.id, userId: access.context.user.id, role: access.context.role as string, label: access.context.profile.full_name }
  const r = reply.success
    ? await customerReply(db, orgId, member, reply.data.caseId, reply.data.body)
    : await openCase(db, orgId, member, open.data!)
  return r.success ? NextResponse.json(r.data) : NextResponse.json({ error: r.error }, { status: r.status })
}
