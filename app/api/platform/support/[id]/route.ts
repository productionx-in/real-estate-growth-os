// app/api/platform/support/[id]/route.ts — one support case: read (with internal notes), reply or add an internal
// note, change status/priority/assignee. Customer business data is never reachable here; that needs a support grant.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { staffActor } from '@/lib/platform/route-auth'
import { getCaseForStaff, staffReply, updateCase } from '@/lib/platform/portal'

type Ctx = { params: Promise<{ id: string }> }
const Reply = z.object({ body: z.string().trim().min(1).max(8000), internal: z.boolean().default(false) })
const Update = z.object({
  status: z.enum(['open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(), assigneeUserId: z.string().uuid().nullish(),
})

export async function GET(_r: NextRequest, { params }: Ctx) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const a = await staffActor('supportRead')
  if (!a.success) return a.response
  const r = await getCaseForStaff(a.db, a.actor, id)
  return r.success ? NextResponse.json(r.data) : NextResponse.json({ error: r.error }, { status: r.status })
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const parsed = Reply.safeParse(await request.json().catch(() => null))
  if (!parsed.success || !z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const a = await staffActor('supportWrite')
  if (!a.success) return a.response
  const r = await staffReply(a.db, a.actor, id, parsed.data.body, parsed.data.internal)
  return r.success ? NextResponse.json(r.data) : NextResponse.json({ error: r.error }, { status: r.status })
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const parsed = Update.safeParse(await request.json().catch(() => null))
  if (!parsed.success || !z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const a = await staffActor('supportWrite')
  if (!a.success) return a.response
  const r = await updateCase(a.db, a.actor, id, parsed.data)
  return r.success ? NextResponse.json(r.data) : NextResponse.json({ error: r.error }, { status: r.status })
}
