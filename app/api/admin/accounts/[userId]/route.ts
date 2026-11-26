// app/api/admin/accounts/[userId]/route.ts — block, unblock or delete a customer's RE sign-in account.
// Platform Owner only, MFA-verified, with a reason; audited. Staff accounts and your own are refused; delete is
// refused while the person still belongs to a workspace (lib/platform/people.ts).
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authenticatePlatformAdmin } from '@/lib/auth/platform'
import { ACCOUNT_ADMINS, changeAccount } from '@/lib/platform/people'

const Body = z.object({ action: z.enum(['block', 'unblock', 'delete']), reason: z.string().trim().min(3, 'Give a reason').max(300) })

export async function POST(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const a = await authenticatePlatformAdmin(ACCOUNT_ADMINS, true)
  if (!a.success) return a.response
  const { userId } = await params
  if (!z.string().uuid().safeParse(userId).success) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the request' }, { status: 400 })
  const r = await changeAccount({ userId: a.auth.user.id, role: a.auth.platformUser.role, label: a.auth.user.email ?? 'RE staff' }, userId, parsed.data.action, parsed.data.reason)
  if (!r.success) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json(r.data)
}
