// app/api/rewards/claims/[claimId]/route.ts — move a reward claim one step (20260100): approve, reject or mark as given
// (owners, admins, managers), or mark as received (a manager, or the winner — for a team reward, its members and
// leader). The database allows only pending → approved/rejected → fulfilled → redeemed and keeps the history.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { requireModule } from '@/lib/auth/entitlements'
import { auditMember } from '@/lib/dal/org-audit'
import { getClaim, stepClaim } from '@/lib/dal/rewards'
import { teamIdsOf } from '@/lib/dal/viewer'
import { canManageRewards, claimSteps } from '@/lib/rewards/rules'

const Body = z.object({ orgId: z.string().uuid(), to: z.enum(['approved', 'rejected', 'fulfilled', 'redeemed']), note: z.string().max(500).optional() })

export async function POST(request: NextRequest, { params }: { params: Promise<{ claimId: string }> }) {
  const { claimId } = await params
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success || !/^[0-9a-f-]{36}$/i.test(claimId)) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { orgId, to } = parsed.data
  const access = await authorizeOrgAccess(orgId)
  if (!access.success) return access.response
  { const gate = await requireModule(access.context.orgId, 'performance'); if (gate) return gate }
  const claim = await getClaim(orgId, claimId)
  if (!claim) return NextResponse.json({ error: 'Reward not found' }, { status: 404 })
  const me = access.context.profile.id
  const winner = claim.profileId === me || (!!claim.teamId && (await teamIdsOf(orgId, me)).includes(claim.teamId))
  const manager = canManageRewards(access.context.role)
  if (!claimSteps(claim.status, { manager, winner }).includes(to)) {
    return NextResponse.json({ error: manager || winner ? 'That step is not possible from where this reward is now.' : 'Only owners, admins and managers can decide rewards.' }, { status: 403 })
  }
  const note = parsed.data.note?.trim() || null
  const r = await stepClaim(orgId, claimId, to, me, note)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 })
  await auditMember(request, access.context, orgId, `reward.claim_${to}`, { type: 'reward_claim', id: claimId }, { from: claim.status, program: claim.programId, note })
  return NextResponse.json({ ok: true })
}
