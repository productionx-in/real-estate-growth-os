// lib/email/adapter.ts — e-mail PROVIDERS (Resend, mock, not-configured). Workflows never call these directly: they
// go through lib/email/service.ts (outbox, retries, logging). Each provider:
//   * takes the sender and reply-to from lib/email/config.ts at send time (nothing is cached or hard-coded);
//   * passes the outbox idempotency key to the provider, so a retried send is not a second e-mail;
//   * gives up after a timeout and classifies every failure: transient (retry), permanent (give up) or config
//     (hold until the configuration is fixed).
// Adding another provider (SES, Postmark, SMTP…) = one class here + a name in EMAIL_PROVIDER; no workflow changes.
import { invitationEmail } from './layout'
import { getEmailConfig } from './config'

export type EmailErrorKind = 'transient' | 'permanent' | 'config'

export interface SendEmailOptions {
  to: string | string[]
  subject: string
  html: string
  text?: string
  /** Overrides the configured sender: tests, the provider's own checks, and buyer-facing e-mail from a workspace's own verified domain (lib/dal/domains.ts orgSender). */
  from?: string
  /** Where replies go. Defaults to the configured EMAIL_REPLY_TO. */
  replyTo?: string
  /** Same key = same e-mail: the provider (or the mock) will not send it twice. */
  idempotencyKey?: string
}

export interface InvitationEmailOptions {
  to: string
  orgName: string
  role: string
  inviteUrl: string
  inviterName?: string
}

export interface EmailResult {
  success: boolean
  id?: string
  error?: string
  /** Set on failure: whether to retry, give up, or hold until the configuration is fixed. */
  errorKind?: EmailErrorKind
  provider?: string
}

export interface EmailAdapter {
  readonly name?: string
  sendEmail(options: SendEmailOptions): Promise<EmailResult>
  sendInvitationEmail(options: InvitationEmailOptions): Promise<EmailResult>
}

/** True for addresses on domains reserved for testing: *.test, *.example, *.invalid, *.localhost, example.com/net/org. */
export function isReservedTestAddress(address: string): boolean {
  const domain = address.trim().toLowerCase().split('@').pop()?.replace(/>$/, '') ?? ''
  return /(^|\.)(test|example|invalid|localhost)$/.test(domain) || /(^|\.)example\.(com|net|org)$/.test(domain)
}

/** How long to wait for the provider before treating the send as a transient failure (default 10 s). */
export const providerTimeoutMs = () => Math.min(Math.max(Number(process.env.EMAIL_PROVIDER_TIMEOUT_MS) || 10_000, 50), 30_000)

/** How a Resend HTTP answer should be treated. */
export function classifyResend(status: number, message: string): EmailErrorKind {
  if (status === 429 || status >= 500 || status === 408) return 'transient'
  if (status === 401 || status === 403) return 'config'                                  // bad or revoked key
  if (/domain|from|sender|not verified|verify/i.test(message)) return 'config'           // sender not allowed
  return 'permanent'                                                                     // e.g. invalid recipient
}

/** Resend (https://resend.com). */
export class ResendEmailAdapter implements EmailAdapter {
  readonly name = 'resend'
  constructor(private apiKey: string, private fromOverride?: string) {}

  async sendEmail(options: SendEmailOptions): Promise<EmailResult> {
    // Demo and test accounts use reserved domains (RFC 2606/6761); never hand those to the provider.
    const recipients = (Array.isArray(options.to) ? options.to : [options.to]).filter((r) => !isReservedTestAddress(r))
    if (recipients.length === 0) return { success: true, id: 'suppressed-test-recipient' }
    const config = getEmailConfig()
    const from = options.from ?? this.fromOverride ?? config.from
    if (!from) return { success: false, errorKind: 'config', provider: this.name, error: config.problems.join(' ') || 'No sender address configured.' }
    const replyTo = options.replyTo ?? config.replyTo
    const controller = new AbortController()
    const timeoutMs = providerTimeoutMs()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey.slice(0, 256) } : {}),
        },
        body: JSON.stringify({ from, to: recipients, subject: options.subject, html: options.html, text: options.text, ...(replyTo ? { reply_to: replyTo } : {}) }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        const message = String(data?.message || `Resend answered ${response.status}`)
        return { success: false, provider: this.name, error: message, errorKind: classifyResend(response.status, message) }
      }
      return { success: true, id: data.id, provider: this.name }
    } catch (err: unknown) {
      const aborted = err instanceof Error && err.name === 'AbortError'
      return { success: false, provider: this.name, errorKind: 'transient', error: aborted ? `Resend did not answer within ${timeoutMs / 1000} s` : err instanceof Error ? err.message : 'Network error communicating with Resend' }
    } finally {
      clearTimeout(timer)
    }
  }

  async sendInvitationEmail(options: InvitationEmailOptions): Promise<EmailResult> {
    return this.sendEmail({ to: options.to, ...invitationEmail(options) })
  }
}

/** Records instead of sending (tests, local development). Behaves like a real provider on idempotency keys, and can
 *  be told to fail, so retries and holds can be tested. */
export class MockEmailAdapter implements EmailAdapter {
  readonly name = 'mock'
  public sentEmails: Array<SendEmailOptions & { id: string; timestamp: Date; from: string; replyTo?: string }> = []
  private byKey = new Map<string, string>()
  /** Next results to return instead of sending, in order (e.g. [{ success:false, errorKind:'transient', error:'503' }]). */
  public scripted: EmailResult[] = []

  async sendEmail(options: SendEmailOptions): Promise<EmailResult> {
    const forced = this.scripted.shift()
    if (forced) return { provider: this.name, ...forced }
    const config = getEmailConfig()
    const from = options.from ?? config.from
    if (!from) return { success: false, errorKind: 'config', provider: this.name, error: config.problems.join(' ') }
    if (options.idempotencyKey && this.byKey.has(options.idempotencyKey)) return { success: true, id: this.byKey.get(options.idempotencyKey), provider: this.name }
    const id = `mock-email-${Math.random().toString(36).slice(2, 10)}`
    if (options.idempotencyKey) this.byKey.set(options.idempotencyKey, id)
    this.sentEmails.push({ ...options, from, replyTo: options.replyTo ?? config.replyTo ?? undefined, id, timestamp: new Date() })
    return { success: true, id, provider: this.name }
  }

  async sendInvitationEmail(options: InvitationEmailOptions): Promise<EmailResult> {
    // Same rendering as production, so tests see exactly what people receive.
    return this.sendEmail({ to: options.to, ...invitationEmail(options) })
  }

  getRecentEmailFor(recipient: string) {
    return this.sentEmails.slice().reverse().find((e) => (Array.isArray(e.to) ? e.to.includes(recipient) : e.to === recipient))
  }

  clear() {
    this.sentEmails = []
    this.byKey.clear()
    this.scripted = []
  }
}

/** No usable provider: every send fails as a CONFIGURATION problem (held in the outbox, never discarded). */
export class NotConfiguredEmailAdapter implements EmailAdapter {
  readonly name = 'none'
  constructor(private reason = 'E-mail is not configured (RESEND_API_KEY is not set), so nothing was sent.') {}
  async sendEmail(): Promise<EmailResult> {
    return { success: false, errorKind: 'config', provider: this.name, error: this.reason }
  }
  async sendInvitationEmail(): Promise<EmailResult> {
    return this.sendEmail()
  }
}

let testAdapter: EmailAdapter | null = null

/** The provider for this send, chosen from the configuration each time (so EMAIL_PROVIDER changes apply at once). */
export function getEmailAdapter(): EmailAdapter {
  if (testAdapter) return testAdapter
  const config = getEmailConfig()
  if (config.provider === 'resend' && process.env.RESEND_API_KEY) return new ResendEmailAdapter(process.env.RESEND_API_KEY)
  if (config.provider === 'mock') return new MockEmailAdapter()
  return new NotConfiguredEmailAdapter(config.problems.find((p) => /provider|RESEND_API_KEY/.test(p))
    ? 'E-mail is not configured (RESEND_API_KEY is not set), so nothing was sent.'
    : config.problems.join(' ') || 'E-mail is not configured, so nothing was sent.')
}

export function setEmailAdapterForTesting(adapter: EmailAdapter | null) {
  testAdapter = adapter
}
