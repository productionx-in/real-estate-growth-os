// app/api/billing/actions/route.ts — start a trial, choose a plan, add seats, or renew. Owners and admins only.
// The database computes every amount from the plan catalogue; nothing here accepts a price.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { runBillingAction } from '@/lib/dal/billing'

const Plan = z.string().regex(/^[a-z_]{2,40}$/)
const Body = z.discriminatedUnion('action', [
  z.object({ orgId: z.string().uuid(), action: z.literal('trial'), plan: Plan }),
  z.object({ orgId: z.string().uuid(), action: z.literal('plan'), plan: Plan, cycle: z.enum(['monthly', 'annual']) }),
  z.object({ orgId: z.string().uuid(), action: z.literal('seats'), seats: z.number().int().min(1).max(500) }),
  z.object({ orgId: z.string().uuid(), action: z.literal('renewal') }),
])

export async function POST(request: NextRequest) {
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { orgId, ...action } = parsed.data
  const access = await authorizeOrgAccess(orgId, ['owner', 'admin'])
  if (!access.success) return access.response
  const result = await runBillingAction(orgId, access.context.profile.id, action)
  if (!result.success) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result.data, { status: 201 })
}
