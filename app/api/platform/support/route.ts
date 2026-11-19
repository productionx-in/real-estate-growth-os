// app/api/platform/support/route.ts — Internal Support queue (support staff, platform admins, Platform Owner; auditors read).
import { NextResponse, type NextRequest } from 'next/server'
import { staffActor } from '@/lib/platform/route-auth'
import { listCases } from '@/lib/platform/portal'

export async function GET(request: NextRequest) {
  const a = await staffActor('supportRead')
  if (!a.success) return a.response
  const r = await listCases(a.db, a.actor, { status: request.nextUrl.searchParams.get('status') ?? 'active', mine: request.nextUrl.searchParams.get('mine') === '1' })
  return r.success ? NextResponse.json(r.data) : NextResponse.json({ error: r.error }, { status: r.status })
}
