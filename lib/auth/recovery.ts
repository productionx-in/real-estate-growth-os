// lib/auth/recovery.ts — where an e-mailed auth link (password reset, invitation, sign-up confirmation) should land
// after Supabase has verified it, and how to explain a link that didn't work.
//
// Supabase can bring the person back in three shapes, depending on its settings (docs/operations/ENVIRONMENT.md):
//   1. /auth/confirm?token_hash=…&type=recovery     — the recommended e-mail template; works on any device.
//   2. /auth/callback?code=…   (PKCE)               — only in the browser that asked for the e-mail.
//   3. /?code=…  or  /#access_token=…&type=recovery  — when the redirect address isn't on Supabase's allowlist it
//      falls back to the Site URL (the homepage). proxy.ts and AuthLinkCatcher forward these to the right place.
// A recovery session is recognised from the token itself (amr method "recovery"), so it always ends on
// /reset-password whatever "next" said.

/** The authentication methods recorded in a Supabase access token (amr claim), or [] if unreadable. */
export function authMethods(accessToken: string | null | undefined): string[] {
  if (!accessToken) return []
  try {
    const payload = accessToken.split('.')[1]
    const json = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
    return Array.isArray(json.amr) ? json.amr.map((m: { method?: string } | string) => (typeof m === 'string' ? m : m.method ?? '')).filter(Boolean) : []
  } catch {
    return []
  }
}

export const isRecoverySession = (accessToken: string | null | undefined) => authMethods(accessToken).includes('recovery')

export type LinkProblem = 'link_expired' | 'link_used' | 'other_device' | 'link_invalid'

/** Turns a Supabase verification error into what the person should be told. */
export function linkProblem(err: { code?: string; message?: string; status?: number } | null | undefined): LinkProblem {
  const code = err?.code ?? ''
  const msg = (err?.message ?? '').toLowerCase()
  if (code === 'otp_expired' || /expired/.test(msg)) return 'link_expired'
  if (code === 'flow_state_not_found' || code === 'bad_code_verifier' || /code verifier|flow state|both auth code and code verifier/.test(msg)) return 'other_device'
  if (/already|used|consumed|invalid grant/.test(msg)) return 'link_used'
  return 'link_invalid'
}

/** What the sign-in page says for each problem, and whether to open "Forgot password" straight away. */
export const LINK_PROBLEM_MESSAGE: Record<LinkProblem, string> = {
  link_expired: 'That link has expired. Links work for a limited time — request a new one below.',
  link_used: 'That link was already used. Each link works once — request a new one below, or sign in if you already set your password.',
  other_device: 'That link has to be opened in the same browser you requested it from. Request a new one below and open it on this device.',
  link_invalid: 'That link isn’t valid any more. Request a new one below.',
}

/** Supabase's own error codes in a redirect (?error_code=… or #error_code=…) mapped to our messages. */
export function problemFromParams(p: URLSearchParams): LinkProblem | null {
  const code = p.get('error_code')
  const description = p.get('error_description')
  if (!code && !p.get('error')) return null
  return linkProblem({ code: code ?? undefined, message: description ?? undefined })
}
