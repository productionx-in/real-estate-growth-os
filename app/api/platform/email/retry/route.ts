// app/api/platform/email/retry/route.ts — put held or failed application e-mails back in the queue (all, or the ones
// given). Platform Owner or platform admin, MFA-verified, audited. Never reveals recipients or content.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authenticatePlatformAdmin, logPlatformAction } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'

const Body = z.object({ ids: z.array(z.string().uuid()).max(200).optional(), includeFailed: z.boolean().default(true) })

export async function POST(request: NextRequest) {
  const a = await authenticatePlatformAdmin(['super_admin', 'platform_admin'], true)
  if (!a.success) return a.response
  const parsed = Body.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const db = createServiceClient()
  const { data, error } = await db.rpc('requeue_emails' as never, { p_ids: parsed.data.ids ?? null, p_include_failed: parsed.data.includeFailed } as never)
  if (error) return NextResponse.json({ error: 'Could not requeue.' }, { status: 400 })
  await logPlatformAction({ actorUserId: a.auth.user.id, actorRole: a.auth.platformUser.role, action: 'email.requeued', targetEntityType: 'email_outbox', targetEntityId: '00000000-0000-0000-0000-000000000000', metadata: { count: data, selected: parsed.data.ids?.length ?? 'all' } })
  return NextResponse.json({ requeued: data })
}
