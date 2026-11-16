// lib/email/adapter.ts
// REGrow: Provider-Independent Email Adapter (Resend + Development Mock)

import { EMAIL_SENDER_NAME, PRODUCT_NAME, PRODUCT_FULL_NAME } from '@/lib/brand'

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
    const subject = `You've been invited to join ${options.orgName} on ${PRODUCT_NAME}`
    const inviter = options.inviterName || 'An administrator'
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #111827;">
        <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 16px;">Workspace Invitation</h2>
        <p style="font-size: 15px; line-height: 24px; margin-bottom: 16px;">
          ${inviter} has invited you to join <strong>${options.orgName}</strong> as a <strong>${options.role}</strong> on ${PRODUCT_FULL_NAME}.
        </p>
        <div style="margin: 28px 0;">
          <a href="${options.inviteUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
            Accept Invitation & Activate Account
          </a>
        </div>
        <p style="font-size: 13px; color: #6b7280; line-height: 20px;">
          This invitation link is personal to you and will expire in 7 days. If you did not expect this invitation, you can safely ignore this email.
        </p>
      </div>
    `
    const text = `${inviter} has invited you to join ${options.orgName} as a ${options.role} on ${PRODUCT_NAME}.\n\nActivate your account at: ${options.inviteUrl}\n\nThis link will expire in 7 days.`

    return this.sendEmail({
      to: options.to,
      subject,
      html,
      text,
    })
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
    const subject = `You've been invited to join ${options.orgName} on ${PRODUCT_NAME}`
    const inviter = options.inviterName || 'An administrator'
    const text = `${inviter} has invited you to join ${options.orgName} as a ${options.role} on ${PRODUCT_NAME}.\n\nActivate your account at: ${options.inviteUrl}`

    return this.sendEmail({
      to: options.to,
      subject,
      html: `<p>${text}</p>`,
      text,
    })
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
