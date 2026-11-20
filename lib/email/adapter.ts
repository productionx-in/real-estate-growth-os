// lib/email/adapter.ts
// REGrow: Provider-Independent Email Adapter (Resend + Development Mock)

import { EMAIL_SENDER_NAME } from '@/lib/brand'
import { invitationEmail } from './layout'

export interface SendEmailOptions {
  to: string | string[]
  subject: string
  html: string
  text?: string
  from?: string
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
}

export interface EmailAdapter {
  sendEmail(options: SendEmailOptions): Promise<EmailResult>
  sendInvitationEmail(options: InvitationEmailOptions): Promise<EmailResult>
}

/** True for addresses on domains reserved for testing: *.test, *.example, *.invalid, *.localhost, example.com/net/org. */
export function isReservedTestAddress(address: string): boolean {
  const domain = address.trim().toLowerCase().split('@').pop()?.replace(/>$/, '') ?? ''
  return /(^|\.)(test|example|invalid|localhost)$/.test(domain) || /(^|\.)example\.(com|net|org)$/.test(domain)
}

/**
 * Resend Email Adapter: Uses official Resend REST API
 */
export class ResendEmailAdapter implements EmailAdapter {
  private apiKey: string
  private defaultFrom: string

  constructor(apiKey: string, defaultFrom: string = `${EMAIL_SENDER_NAME} <noreply@productionx.ai>`) {
    this.apiKey = apiKey
    this.defaultFrom = defaultFrom
  }

  async sendEmail(options: SendEmailOptions): Promise<EmailResult> {
    // Demo and test accounts use reserved domains (RFC 2606/6761); never hand those to the provider.
    const recipients = (Array.isArray(options.to) ? options.to : [options.to]).filter((r) => !isReservedTestAddress(r))
    if (recipients.length === 0) return { success: true, id: 'suppressed-test-recipient' }
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: options.from || this.defaultFrom,
          to: recipients,
          subject: options.subject,
          html: options.html,
          text: options.text,
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        return { success: false, error: data?.message || 'Failed to send email via Resend' }
      }

      return { success: true, id: data.id }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Network error communicating with Resend'
      return { success: false, error: errorMsg }
    }
  }

  async sendInvitationEmail(options: InvitationEmailOptions): Promise<EmailResult> {
    return this.sendEmail({ to: options.to, ...invitationEmail(options) })
  }
}

/**
 * Mock Email Adapter for offline test execution and development
 */
export class MockEmailAdapter implements EmailAdapter {
  public sentEmails: Array<SendEmailOptions & { id: string; timestamp: Date }> = []

  async sendEmail(options: SendEmailOptions): Promise<EmailResult> {
    const id = `mock-email-${Math.random().toString(36).slice(2, 10)}`
    this.sentEmails.push({
      ...options,
      id,
      timestamp: new Date(),
    })
    return { success: true, id }
  }

  async sendInvitationEmail(options: InvitationEmailOptions): Promise<EmailResult> {
    // Same rendering as production, so tests see exactly what people receive.
    return this.sendEmail({ to: options.to, ...invitationEmail(options) })
  }

  getRecentEmailFor(recipient: string) {
    return this.sentEmails
      .slice()
      .reverse()
      .find((e) => (Array.isArray(e.to) ? e.to.includes(recipient) : e.to === recipient))
  }

  clear() {
    this.sentEmails = []
  }
}

/**
 * Used on a production deployment when no e-mail provider is configured: every send fails with a clear reason, so
 * callers record the failure and tell the user, instead of a silent mock reporting success.
 */
export class NotConfiguredEmailAdapter implements EmailAdapter {
  async sendEmail(): Promise<EmailResult> {
    return { success: false, error: 'E-mail is not configured (RESEND_API_KEY is not set), so nothing was sent.' }
  }
  async sendInvitationEmail(): Promise<EmailResult> {
    return this.sendEmail()
  }
}

let activeAdapter: EmailAdapter | null = null

export function getEmailAdapter(): EmailAdapter {
  if (activeAdapter) return activeAdapter

  const apiKey = process.env.RESEND_API_KEY
  if (apiKey && apiKey.startsWith('re_')) {
    activeAdapter = new ResendEmailAdapter(apiKey, process.env.RESEND_FROM_EMAIL)
  } else if (process.env.VERCEL_ENV === 'production') {
    activeAdapter = new NotConfiguredEmailAdapter()
  } else {
    activeAdapter = new MockEmailAdapter()
  }

  return activeAdapter
}

export function setEmailAdapterForTesting(adapter: EmailAdapter | null) {
  activeAdapter = adapter
}
