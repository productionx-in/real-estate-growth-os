// app/api/team/members/reset-password/route.ts — an owner or admin sends a team member a password-reset e-mail.
// REGrow never sees or sets the password: the member gets the normal reset link at their own address. Same rules as
// changing a role: not your own account (use "Forgot password"), an owner only by an owner, active members only.
// Audited, and limited to one e-mail per member every 10 minutes.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authorizeOrgAccess } from '@/lib/auth/tenant'
import { auditMember } from '@/lib/dal/org-audit'
import { createServiceClient } from '@/lib/supabase/server'
import { appUrl } from '@/lib/site/urls'

const Schema = z.object({ orgId: z.string().uuid(), memberId: z.string().uuid() })

export async function POST(request: NextRequest) {
  const parsed = Schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { orgId, memberId } = parsed.data
  const access = await authorizeOrgAccess(orgId, ['owner', 'admin'])
  if (!access.success) return access.response
  const db = createServiceClient()

  const { data: member } = await db.from('org_members').select('id, profile_id, role, status').eq('org_id', orgId).eq('id', memberId).eq('status', 'active').maybeSingle()
  if (!member || member.status !== 'active') return NextResponse.json({ error: 'This person is not an active member of the workspace.' }, { status: 404 })
  if (member.profile_id === access.context.profile.id) return NextResponse.json({ error: 'To change your own password, use Settings → Sign-in & security.' }, { status: 400 })
  if (member.role === 'owner' && access.context.role !== 'owner') return NextResponse.json({ error: 'Only an owner can send this to another owner.' }, { status: 403 })

  const since = new Date(Date.now() - 10 * 60_000).toISOString()
  const { count } = await db.from('org_audit_logs').select('id', { count: 'exact', head: true })
    .eq('org_id', orgId).eq('action', 'member.password_reset_sent').eq('target_id', memberId).gte('created_at', since)
  if ((count ?? 0) > 0) return NextResponse.json({ error: 'A reset e-mail was sent to this person in the last 10 minutes. Ask them to check their inbox and spam folder.' }, { status: 429 })

  const { data: profile } = await db.from('profiles').select('auth_user_id').eq('id', member.profile_id).maybeSingle()
  const { data: user } = profile?.auth_user_id ? await db.auth.admin.getUserById(profile.auth_user_id) : { data: null }
  const email = user?.user?.email
  if (!email) return NextResponse.json({ error: 'This account has no e-mail address to send to.' }, { status: 400 })
  const base = appUrl()
  if (!base) return NextResponse.json({ error: 'The app address is not configured, so a reset link cannot be built.' }, { status: 503 })

  const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: `${base}/auth/callback?next=/reset-password` })
  if (error) return NextResponse.json({ error: 'Could not send the e-mail. Please try again in a few minutes.' }, { status: 502 })
  await auditMember(request, access.context, orgId, 'member.password_reset_sent', { type: 'org_member', id: memberId }, {})
  return NextResponse.json({ ok: true })
}
