// app/api/platform/sales/[id]/route.ts — one prospect: read, update (stage, owner, follow-up), log an activity.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { staffActor } from '@/lib/platform/route-auth'
import { STAGES, addProspectActivity, getProspect, updateProspect } from '@/lib/platform/portal'

type Ctx = { params: Promise<{ id: string }> }
const Update = z.object({
  stage: z.enum(STAGES).optional(), lostReason: z.string().trim().max(500).nullish(), ownerUserId: z.string().uuid().nullish(),
  nextFollowUpAt: z.string().datetime().nullish(), notes: z.string().trim().max(4000).nullish(),
})
const Activity = z.object({ kind: z.enum(['call', 'email', 'meeting', 'note']), body: z.string().trim().min(1).max(4000) })

export async function GET(_r: NextRequest, { params }: Ctx) {
  const { id } = await params
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const a = await staffActor('salesRead')
  if (!a.success) return a.response
  const r = await getProspect(a.db, a.actor, id)
  return r.success ? NextResponse.json(r.data) : NextResponse.json({ error: r.error }, { status: r.status })
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const parsed = Update.safeParse(await request.json().catch(() => null))
  if (!parsed.success || !z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const a = await staffActor('salesWrite')
  if (!a.success) return a.response
  const r = await updateProspect(a.db, a.actor, id, parsed.data)
  return r.success ? NextResponse.json(r.data) : NextResponse.json({ error: r.error }, { status: r.status })
}

export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const parsed = Activity.safeParse(await request.json().catch(() => null))
  if (!parsed.success || !z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const a = await staffActor('salesWrite')
  if (!a.success) return a.response
  const r = await addProspectActivity(a.db, a.actor, id, parsed.data.kind, parsed.data.body)
  return r.success ? NextResponse.json(r.data) : NextResponse.json({ error: r.error }, { status: r.status })
}
