// app/api/platform/staff/route.ts — staff accounts (Platform Owner only): list, give an existing account a role.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { staffActor } from '@/lib/platform/route-auth'
import { addStaff, listStaff } from '@/lib/platform/portal'

const ROLES = ['super_admin', 'platform_admin', 'finance_admin', 'sales_manager', 'sales_rep', 'support_agent', 'auditor'] as const

export async function GET() {
  const a = await staffActor('staff')
  if (!a.success) return a.response
  const r = await listStaff(a.db, a.actor)
  return r.success ? NextResponse.json(r.data) : NextResponse.json({ error: r.error }, { status: r.status })
}

export async function POST(request: NextRequest) {
  const parsed = z.object({ email: z.string().trim().email(), role: z.enum(ROLES) }).safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Enter an email address and a role.' }, { status: 400 })
  const a = await staffActor('staff')
  if (!a.success) return a.response
  const r = await addStaff(a.db, a.actor, parsed.data.email, parsed.data.role)
  return r.success ? NextResponse.json(r.data) : NextResponse.json({ error: r.error }, { status: r.status })
}
