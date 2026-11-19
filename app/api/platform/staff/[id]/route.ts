// app/api/platform/staff/[id]/route.ts — change a staff member's role or deactivate them (Platform Owner only;
// never yourself; at least one active Platform Owner always remains).
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { staffActor } from '@/lib/platform/route-auth'
import { changeStaff } from '@/lib/platform/portal'

type Ctx = { params: Promise<{ id: string }> }
const ROLES = ['super_admin', 'platform_admin', 'finance_admin', 'sales_manager', 'sales_rep', 'support_agent', 'auditor'] as const

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { id } = await params
  const parsed = z.object({ role: z.enum(ROLES).optional(), active: z.boolean().optional() }).safeParse(await request.json().catch(() => null))
  if (!parsed.success || !z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const a = await staffActor('staff')
  if (!a.success) return a.response
  const r = await changeStaff(a.db, a.actor, id, parsed.data)
  return r.success ? NextResponse.json(r.data) : NextResponse.json({ error: r.error }, { status: r.status })
}
