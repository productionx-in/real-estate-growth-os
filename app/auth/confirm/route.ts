// app/auth/confirm/route.ts — one-time links that carry a token hash (password recovery, staff setup, invitations,
// sign-up confirmation). Works on any device: nothing from the requesting browser is needed. Verifying signs the
// person in once; a recovery always continues to /reset-password, anything else to a same-origin "next".
import { NextResponse, type NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { safeRedirectPath } from '@/lib/auth/safe-redirect'
import { linkProblem, problemFromParams } from '@/lib/auth/recovery'

const TYPES: EmailOtpType[] = ['invite', 'recovery', 'magiclink', 'signup', 'email', 'email_change']

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = safeRedirectPath(searchParams.get('next'))
  const staff = next.startsWith('/platform') || next === '/account/security'
  const failed = (problem: string) =>
    NextResponse.redirect(new URL(`/login?error=${problem}${type === 'recovery' ? '&mode=forgot' : ''}${staff ? '&for=staff' : ''}`, origin))

  const reported = problemFromParams(searchParams)
  if (reported) return failed(reported)
  if (!tokenHash || !type || !TYPES.includes(type)) return failed('link_invalid')

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
  if (error) return failed(linkProblem(error))
  return NextResponse.redirect(new URL(type === 'recovery' ? '/reset-password' : next, origin))
}
