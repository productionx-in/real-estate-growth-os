// app/api/rewards/route.ts — create a reward programme (20260100). Owners, admins and managers. The database checks the
// programme again and finds winners from the performance ledger; this never names a winner.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { auditMember } from '@/lib/dal/org-audit'
import { saveProgram } from '@/lib/dal/rewards'
import { REWARD_MANAGERS, normaliseProgram } from '@/lib/rewards/rules'

const Body = z.object({ orgId: z.string().uuid(), program: z.record(z.string(), z.unknown()) })

export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { orgId } = parsed.data
  const access = await authorizeOrgAccess(orgId, [...REWARD_MANAGERS])
  if (!access.success) return access.response
  const { value, error } = normaliseProgram(parsed.data.program)
  if (!value) return NextResponse.json({ error }, { status: 400 })
  const r = await saveProgram(orgId, null, value, access.context.profile.id)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  await auditMember(request, access.context, orgId, 'reward.program_created', { type: 'reward_program', id: r.id },
    { title: value.title, reward: value.rewardDetail, type: value.rewardType, budget: value.budget, goal: value.goalKind, metric: value.metric, ends: value.endsOn })
  return NextResponse.json({ ok: true, id: r.id, winners: r.winners }, { status: 201 })
}
