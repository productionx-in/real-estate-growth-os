// app/api/admin/organisations/[orgId]/details/route.ts — rename a customer workspace. Platform Owner or platform
// admin, MFA-verified, audited. The address (slug) never changes, so links and bookmarks keep working.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authenticatePlatformAdmin, logPlatformAction } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'

const Body = z.object({ name: z.string().trim().min(2, 'Name must be at least 2 characters').max(120) })

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const a = await authenticatePlatformAdmin(['super_admin', 'platform_admin'], true)
  if (!a.success) return a.response
  const { orgId } = await params
  if (!z.string().uuid().safeParse(orgId).success) return NextResponse.json({ error: 'Invalid organisation id' }, { status: 400 })
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the name' }, { status: 400 })
  const db = createServiceClient()
  const { data: before } = await db.from('organisations').select('name').eq('id', orgId).maybeSingle()
  if (!before) return NextResponse.json({ error: 'Organisation not found' }, { status: 404 })
  if (before.name === parsed.data.name) return NextResponse.json({ ok: true, unchanged: true })
  const { error } = await db.from('organisations').update({ name: parsed.data.name }).eq('id', orgId)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  await logPlatformAction({ actorUserId: a.auth.user.id, actorRole: a.auth.platformUser.role, action: 'organisation.renamed', targetEntityType: 'organisations', targetEntityId: orgId, metadata: { from: before.name, to: parsed.data.name } })
  return NextResponse.json({ ok: true })
}
