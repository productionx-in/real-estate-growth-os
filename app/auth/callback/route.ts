// app/auth/callback/route.ts — finishes an e-mailed link that came back with a one-time code (PKCE): password reset,
// sign-up confirmation, magic link. A password-reset session always lands on /reset-password (lib/auth/recovery.ts);
// anything else goes to a same-origin "next". A link that didn't work explains why on the sign-in page.
import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'
import { safeRedirectPath } from '@/lib/auth/safe-redirect'
import { isRecoverySession, linkProblem, problemFromParams } from '@/lib/auth/recovery'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Only same-origin paths: `${origin}${next}` with next='@evil.com' would leave the site (open redirect).
  const next = safeRedirectPath(searchParams.get('next'))
  const failed = (problem: string) => NextResponse.redirect(new URL(`/login?error=${problem}&mode=forgot`, origin))

  // Supabase itself refused the link (expired, already used…) and says so in the redirect.
  const reported = problemFromParams(searchParams)
  if (reported) return failed(reported)
  if (!code) return failed('link_invalid')

  const supabase = await createClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return failed(linkProblem(error))
  const to = isRecoverySession(data.session?.access_token) || next === '/reset-password' ? '/reset-password' : next
  return NextResponse.redirect(new URL(to, origin))
}
