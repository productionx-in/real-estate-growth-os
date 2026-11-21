// app/api/admin/organisations/[orgId]/members/[memberId]/route.ts — suspend or restore one person's access to one
// customer workspace from the console. Platform Owner or platform admin, MFA-verified, with a reason; audited in
// the platform log and in the customer's own audit log (lib/platform/people.ts).
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authenticatePlatformAdmin } from '@/lib/auth/platform'
import { MEMBER_ADMINS, setMemberAccess } from '@/lib/platform/people'
import { createServiceClient } from '@/lib/supabase/server'

const Body = z.object({ action: z.enum(['suspend', 'restore']), reason: z.string().trim().min(3, 'Give a reason').max(300) })

export async function POST(request: NextRequest, { params }: { params: Promise<{ orgId: string; memberId: string }> }) {
  const a = await authenticatePlatformAdmin(MEMBER_ADMINS, true)
  if (!a.success) return a.response
  const { orgId, memberId } = await params
  if (!z.string().uuid().safeParse(orgId).success || !z.string().uuid().safeParse(memberId).success) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the request' }, { status: 400 })
  const { data: profile } = await createServiceClient().from('profiles').select('full_name').eq('auth_user_id', a.auth.user.id).maybeSingle()
  const r = await setMemberAccess({ userId: a.auth.user.id, role: a.auth.platformUser.role, label: profile?.full_name || a.auth.user.email || 'REGrow staff' },
    orgId, memberId, parsed.data.action, parsed.data.reason)
  if (!r.success) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json(r.data)
}
