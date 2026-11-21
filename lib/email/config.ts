// lib/email/config.ts — the ONE place the application's e-mail sender, reply-to and provider are decided.
//
// Read on every delivery (never cached, never stored on queued e-mails), so changing EMAIL_FROM_ADDRESS & co. in the
// environment takes effect on the next send with no change to jobs or the outbox.
//
//   EMAIL_PROVIDER      resend | mock | none           (default: resend when RESEND_API_KEY is set; none in production; mock elsewhere)
//   EMAIL_FROM_NAME     display name                   (default: the product name)
//   EMAIL_FROM_ADDRESS  sender on a verified domain    (required for a real provider; no hard-coded fallback)
//   EMAIL_REPLY_TO      where replies go               (optional)
//   RESEND_API_KEY      provider credential            (never returned, logged or shown — only "present")
//
// Backward compatible: RESEND_FROM_EMAIL ("Name <addr>" or "addr") and RESEND_REPLY_TO are used when the new names are
// absent, so a deployment can switch over without an outage. Supabase Auth e-mails (password reset, sign-up, magic
// link) do NOT use any of this: they are sent by Supabase with its own SMTP settings (docs/operations/ENVIRONMENT.md).
import { EMAIL_SENDER_NAME } from '@/lib/brand'

export type EmailProviderName = 'resend' | 'mock' | 'none'
export interface EmailConfig {
  provider: EmailProviderName
  fromName: string
  fromAddress: string | null
  replyTo: string | null
  /** RFC 5322 "Name <address>", or null when there is no valid sender. */
  from: string | null
  apiKeyPresent: boolean
  /** Why sending cannot work right now (empty = valid). Safe to show to staff: never contains secrets. */
  problems: string[]
  /** Which variables supplied the values — for the admin page, so a half-migrated setup is visible. */
  source: { from: 'EMAIL_FROM_ADDRESS' | 'RESEND_FROM_EMAIL' | 'default' | 'none'; provider: 'EMAIL_PROVIDER' | 'inferred' }
}

const ADDRESS = /^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]{2,}$/
const clean = (v: string | undefined) => (v ?? '').trim() || null

/** "REGrow <noreply@x.in>" → { name, address }; "noreply@x.in" → { address }. */
export function parseMailbox(v: string | null): { name: string | null; address: string | null } {
  if (!v) return { name: null, address: null }
  const m = v.match(/^\s*"?([^"<]*?)"?\s*<\s*([^>]+)\s*>\s*$/)
  if (m) return { name: m[1].trim() || null, address: m[2].trim() }
  return { name: null, address: v.trim() }
}

export function getEmailConfig(env: Record<string, string | undefined> = process.env): EmailConfig {
  const problems: string[] = []
  const production = env.VERCEL_ENV === 'production'
  const apiKey = clean(env.RESEND_API_KEY)
  const explicitProvider = clean(env.EMAIL_PROVIDER)?.toLowerCase() ?? null
  let provider: EmailProviderName
  if (explicitProvider) {
    if (explicitProvider === 'resend' || explicitProvider === 'mock' || explicitProvider === 'none') provider = explicitProvider
    else { problems.push(`EMAIL_PROVIDER "${explicitProvider}" is not supported (use resend, mock or none).`); provider = 'none' }
  } else provider = apiKey ? 'resend' : production ? 'none' : 'mock'
  if (provider === 'mock' && production) problems.push('EMAIL_PROVIDER is "mock" in production: nothing would be delivered.')
  if (provider === 'none') problems.push('No e-mail provider is configured (set EMAIL_PROVIDER and the provider key).')
  if (provider === 'resend' && !apiKey) problems.push('EMAIL_PROVIDER is resend but RESEND_API_KEY is not set.')
  if (provider === 'resend' && apiKey && !apiKey.startsWith('re_')) problems.push('RESEND_API_KEY does not look like a Resend key.')

  const legacy = parseMailbox(clean(env.RESEND_FROM_EMAIL))
  const explicitAddress = clean(env.EMAIL_FROM_ADDRESS)
  let fromAddress = explicitAddress ?? legacy.address
  let source: EmailConfig['source']['from'] = explicitAddress ? 'EMAIL_FROM_ADDRESS' : legacy.address ? 'RESEND_FROM_EMAIL' : 'none'
  if (!fromAddress && provider === 'mock') { fromAddress = 'noreply@localhost.test'; source = 'default' } // tests and local only
  if (!fromAddress) problems.push('No sender address: set EMAIL_FROM_ADDRESS (an address on a domain verified with the provider).')
  else if (!ADDRESS.test(fromAddress)) { problems.push(`EMAIL_FROM_ADDRESS "${fromAddress}" is not a valid e-mail address.`); fromAddress = null }

  const fromName = (clean(env.EMAIL_FROM_NAME) ?? legacy.name ?? EMAIL_SENDER_NAME).replace(/["<>\r\n]/g, '').slice(0, 80)
  let replyTo = clean(env.EMAIL_REPLY_TO) ?? clean(env.RESEND_REPLY_TO)
  if (replyTo && !ADDRESS.test(replyTo)) { problems.push(`EMAIL_REPLY_TO "${replyTo}" is not a valid e-mail address.`); replyTo = null }

  return {
    provider, fromName, fromAddress, replyTo, apiKeyPresent: Boolean(apiKey), problems,
    from: fromAddress ? `${fromName} <${fromAddress}>` : null,
    source: { from: source, provider: explicitProvider ? 'EMAIL_PROVIDER' : 'inferred' },
  }
}

/** "ravi@acme.com" → "ra***@acme.com", for logs and admin screens. */
export function maskAddress(email: string): string {
  const [u, d] = email.split('@')
  return d ? `${u.slice(0, 2)}***@${d}` : '***'
}

/** Removes anything that looks like an e-mail address or a secret from a provider error before it is stored. */
export function sanitizeError(message: string): string {
  return message
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, (m) => maskAddress(m))
    .replace(/re_[A-Za-z0-9_]{6,}/g, 're_***')
    .replace(/Bearer\s+\S+/gi, 'Bearer ***')
    .slice(0, 500)
}
