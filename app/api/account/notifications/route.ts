// app/api/account/notifications/route.ts — the signed-in person's own e-mail preferences (daily report on/off).
// Changes only their own profile, through their own session (RLS: users_can_update_own_profile).
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const Body = z.object({ dailyReport: z.boolean() })

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const { error } = await supabase.from('profiles').update({ email_daily_report: parsed.data.dailyReport } as never).eq('auth_user_id', user.id)
  if (error) return NextResponse.json({ error: 'Could not save your choice.' }, { status: 400 })
  return NextResponse.json({ ok: true, dailyReport: parsed.data.dailyReport })
}
