// app/api/account/notifications/route.ts — the signed-in person's own notification choices: daily report and weekly
// digest e-mails, which alerts reach their devices, and quiet hours. Changes only their own profile, through their
// own session (RLS: users_can_update_own_profile).
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { normalisePerson } from '@/lib/notifications/prefs'

const Body = z.object({
  dailyReport: z.boolean().optional(),
  weeklyDigest: z.boolean().optional(),
  prefs: z.record(z.string(), z.unknown()).optional(),
}).refine((b) => b.dailyReport !== undefined || b.weeklyDigest !== undefined || b.prefs !== undefined)

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const patch: Record<string, unknown> = {}
  if (parsed.data.dailyReport !== undefined) patch.email_daily_report = parsed.data.dailyReport
  if (parsed.data.weeklyDigest !== undefined) patch.email_weekly_digest = parsed.data.weeklyDigest
  if (parsed.data.prefs !== undefined) {
    const { value, errors } = normalisePerson(parsed.data.prefs)
    if (Object.keys(errors).length) return NextResponse.json({ error: Object.values(errors)[0] }, { status: 400 })
    patch.notification_prefs = value
  }
  const { error } = await supabase.from('profiles').update(patch as never).eq('auth_user_id', user.id)
  if (error) return NextResponse.json({ error: 'Could not save your choice.' }, { status: 400 })
  return NextResponse.json({ ok: true, dailyReport: parsed.data.dailyReport, ...patch })
}
