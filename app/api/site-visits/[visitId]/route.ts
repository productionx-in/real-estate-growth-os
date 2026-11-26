// app/api/site-visits/[visitId]/route.ts — reschedule, check in, complete, mark no-show, cancel.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeLeadWork } from '@/lib/follow-ups/auth'
import { requireModule } from '@/lib/auth/entitlements'
import { actOnVisit, getVisit, OUTCOMES, type VisitAction } from '@/lib/dal/site-visits'

const Schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('reschedule'), scheduledAt: z.string().datetime({ offset: true }) }),
  z.object({ action: z.literal('check_in'), lat: z.number().min(-90).max(90).nullable(), lng: z.number().min(-180).max(180).nullable() }),
  z.object({
    action: z.literal('complete'),
    outcome: z.enum(Object.keys(OUTCOMES) as [keyof typeof OUTCOMES, ...(keyof typeof OUTCOMES)[]]),
    rating: z.number().int().min(1).max(5).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  }),
  z.object({ action: z.literal('no_show') }),
  z.object({ action: z.literal('cancel'), reason: z.string().trim().max(500).nullable().optional() }),
])

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ visitId: string }> }) {
  const { visitId } = await params
  if (!z.string().uuid().safeParse(visitId).success) return NextResponse.json({ error: 'Invalid visit id' }, { status: 400 })
  const visit = await getVisit(visitId)
  if (!visit) return NextResponse.json({ error: 'Site visit not found.' }, { status: 404 })

  // Same rule as working the lead: managers and above, or the salesperson the lead is assigned to.
  const auth = await authorizeLeadWork(visit.lead_id)
  if (!auth.success) return auth.response
  { const gate = await requireModule(auth.context.orgId, 'visits'); if (gate) return gate }

  const parsed = Schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 })
  const body = parsed.data
  const act: VisitAction = body.action === 'reschedule' ? { action: 'reschedule', scheduledAt: new Date(body.scheduledAt) } : body

  const result = await actOnVisit(visitId, auth.context.orgId, auth.context.profile.id, act)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ success: true, ...result.data })
}
