// app/api/account/profile/route.ts — the signed-in person's own name and phone. Their own session and row only
// (RLS: users_can_update_own_profile); nothing else on the profile can be changed here.
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const Body = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name.').max(80, 'Keep your name under 80 characters.'),
  phone: z.string().trim().max(24).regex(/^(\+?[0-9 ()-]{6,24})?$/, 'Phone: digits, spaces and + only.').optional(),
})

export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid details' }, { status: 400 })
  const { error } = await supabase.from('profiles')
    .update({ full_name: parsed.data.fullName, phone: parsed.data.phone || null })
    .eq('auth_user_id', user.id)
  if (error) return NextResponse.json({ error: 'Could not save your profile.' }, { status: 400 })
  return NextResponse.json({ ok: true })
}
