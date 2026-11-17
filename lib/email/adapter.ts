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
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: options.from || this.defaultFrom,
          to: Array.isArray(options.to) ? options.to : [options.to],
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

let activeAdapter: EmailAdapter | null = null

export function getEmailAdapter(): EmailAdapter {
  if (activeAdapter) return activeAdapter

  const apiKey = process.env.RESEND_API_KEY
  if (apiKey && apiKey.startsWith('re_')) {
    activeAdapter = new ResendEmailAdapter(apiKey, process.env.RESEND_FROM_EMAIL)
  } else {
    activeAdapter = new MockEmailAdapter()
  }

  return activeAdapter
}

export function setEmailAdapterForTesting(adapter: EmailAdapter | null) {
  activeAdapter = adapter
}
