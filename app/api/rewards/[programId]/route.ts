// app/api/rewards/[programId]/route.ts — change or cancel a reward programme, or look for winners now (20260100).
// Owners, admins and managers. Once anyone has won, the database keeps the goal, dates and eligibility fixed.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { requireModule } from '@/lib/auth/entitlements'
import { auditMember } from '@/lib/dal/org-audit'
import { cancelProgram, getProgram, qualifyNow, saveProgram } from '@/lib/dal/rewards'
import { REWARD_MANAGERS, normaliseProgram } from '@/lib/rewards/rules'

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), orgId: z.string().uuid(), program: z.record(z.string(), z.unknown()) }),
  z.object({ action: z.literal('cancel'), orgId: z.string().uuid() }),
  z.object({ action: z.literal('check'), orgId: z.string().uuid() }),
])

export async function POST(request: NextRequest, { params }: { params: Promise<{ programId: string }> }) {
  const { programId } = await params
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success || !/^[0-9a-f-]{36}$/i.test(programId)) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { orgId } = parsed.data
  const access = await authorizeOrgAccess(orgId, [...REWARD_MANAGERS])
  if (!access.success) return access.response
  { const gate = await requireModule(access.context.orgId, 'performance'); if (gate) return gate }
  const existing = await getProgram(orgId, programId)
  if (!existing) return NextResponse.json({ error: 'Programme not found' }, { status: 404 })
  if (parsed.data.action === 'cancel') {
    if (!(await cancelProgram(orgId, programId))) return NextResponse.json({ error: 'This programme has already ended.' }, { status: 409 })
    await auditMember(request, access.context, orgId, 'reward.program_cancelled', { type: 'reward_program', id: programId }, { title: existing.title })
    return NextResponse.json({ ok: true })
  }
  if (parsed.data.action === 'check') {
    if (existing.status !== 'active') return NextResponse.json({ error: 'This programme is not running.' }, { status: 409 })
    return NextResponse.json({ ok: true, winners: await qualifyNow(programId) })
  }
  const { value, error } = normaliseProgram(parsed.data.program)
  if (!value) return NextResponse.json({ error }, { status: 400 })
  const r = await saveProgram(orgId, programId, value, access.context.profile.id)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  await auditMember(request, access.context, orgId, 'reward.program_changed', { type: 'reward_program', id: programId },
    { title: value.title, reward: value.rewardDetail, budget: value.budget, ends: value.endsOn })
  return NextResponse.json({ ok: true, winners: r.winners })
}
