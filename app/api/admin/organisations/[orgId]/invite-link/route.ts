// app/api/admin/organisations/[orgId]/invite-link/route.ts — a fresh one-time invitation link for a pending
// invitation of a customer workspace (e.g. the owner's, when the e-mail never arrived or e-mail isn't set up).
// Platform Owner only, MFA-verified. The old link stops working; the new one expires in 14 days; an e-mail is tried
// too. The link goes back only to this verified Platform Owner, to share with the person; it is audited, never logged.
import { NextResponse, type NextRequest } from 'next/server'
import crypto from 'node:crypto'
import { z } from 'zod'
import { authenticatePlatformAdmin, logPlatformAction } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'
import { sendInvitation } from '@/lib/email/service'
import { appUrl } from '@/lib/site/urls'

const Body = z.object({ invitationId: z.string().uuid() })
const ROLE_LABEL: Record<string, string> = { owner: 'Owner & Primary Administrator', admin: 'Administrator' }

export async function POST(request: NextRequest, { params }: { params: Promise<{ orgId: string }> }) {
  const a = await authenticatePlatformAdmin(['super_admin'], true)
  if (!a.success) return a.response
  const { orgId } = await params
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!z.string().uuid().safeParse(orgId).success || !parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const db = createServiceClient()
  const { data: inv } = await db.from('org_invitations').select('id, email, role, status').eq('id', parsed.data.invitationId).eq('org_id', orgId).maybeSingle()
  if (!inv) return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 })
  if (inv.status !== 'pending') return NextResponse.json({ error: 'This invitation is no longer pending.' }, { status: 409 })
  const { data: org } = await db.from('organisations').select('name').eq('id', orgId).maybeSingle()

  const raw = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 14 * 86_400_000).toISOString()
  const { error } = await db.from('org_invitations').update({
    token_hash: crypto.createHash('sha256').update(raw).digest('hex'), expires_at: expiresAt, updated_at: new Date().toISOString(),
  }).eq('id', inv.id).eq('status', 'pending')
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const origin = appUrl(request.nextUrl.origin) ?? request.nextUrl.origin
  const url = `${origin}/invite/${raw}`
  let emailed = false
  let emailError: string | null = null
  try {
    const sent = await sendInvitation(db, { orgId, invitationId: inv.id, to: inv.email, orgName: org?.name ?? 'RE', role: ROLE_LABEL[inv.role] ?? inv.role, inviteUrl: url, inviterName: 'RE' })
    emailed = sent.success
    if (!sent.success) emailError = sent.error ?? 'e-mail not sent'
  } catch (e) { emailError = e instanceof Error ? e.message : 'e-mail not sent' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as unknown as { from: (t: string) => any }).from('org_invitations').update({ delivery_status: emailed ? 'delivered' : 'failed', last_delivery_error: emailError, delivery_updated_at: new Date().toISOString() }).eq('id', inv.id)

  await logPlatformAction({ actorUserId: a.auth.user.id, actorRole: a.auth.platformUser.role, action: 'invitation.link_reissued', targetEntityType: 'org_invitations', targetEntityId: inv.id, metadata: { org_id: orgId, role: inv.role, emailed } })
  return NextResponse.json({ url, email: inv.email, emailed, emailError, expiresAt })
}
