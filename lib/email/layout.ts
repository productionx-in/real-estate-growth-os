// lib/email/layout.ts
// REGrow branded email: one table-based layout (renders in Gmail, Outlook, Apple Mail, dark mode) used by every
// email the app sends. Every value placed in the HTML is escaped — names and organisation names are typed by
// users, and unescaped they would let anyone put links or markup into mail sent from REGrow's address.
import { COMPANY_NAME, PRODUCT_FULL_NAME, PRODUCT_NAME } from '@/lib/brand'

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Only http(s) links may become buttons; anything else (javascript:, data:) is refused. */
export function safeUrl(url: string): string {
  const u = new URL(url)
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('email links must be http(s)')
  return u.toString()
}

export interface EmailContent {
  /** Short line shown next to the subject in the inbox. */
  preheader: string
  heading: string
  /** Paragraphs of plain text. Use **bold** for emphasis; nothing else is interpreted. */
  paragraphs: string[]
  cta?: { label: string; url: string }
  /** Small print under the button (expiry, "ignore if unexpected"). */
  footnote?: string
  /** Why the person got this e-mail, in the footer. Defaults to an action in a workspace. */
  reason?: string
}

const BRAND = '#1d4ed8'
const TEXT = '#111827'
const MUTED = '#4b5563'
const SUBTLE = '#6b7280'
const BORDER = '#e5e7eb'
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

const inline = (text: string) => escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

export function renderEmail(content: EmailContent): { html: string; text: string } {
  const cta = content.cta ? { label: content.cta.label, url: safeUrl(content.cta.url) } : null
  const paragraphs = content.paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:${TEXT};">${inline(p)}</p>`)
    .join('')
  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;"><tr><td style="border-radius:8px;background:${BRAND};">
        <a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(cta.label)}</a>
      </td></tr></table>
      <p style="margin:0 0 16px;font-size:12px;line-height:18px;color:${SUBTLE};">Button not working? Copy this link into your browser:<br><a href="${escapeHtml(cta.url)}" style="color:${BRAND};word-break:break-all;">${escapeHtml(cta.url)}</a></p>`
    : ''
  const footnote = content.footnote
    ? `<p style="margin:16px 0 0;padding-top:16px;border-top:1px solid ${BORDER};font-size:13px;line-height:20px;color:${MUTED};">${inline(content.footnote)}</p>`
    : ''

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${escapeHtml(content.heading)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:${FONT};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(content.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;"><tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
    <tr><td style="padding:0 4px 16px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="width:32px;height:32px;border-radius:8px;background:${BRAND};color:#ffffff;font-weight:700;font-size:15px;text-align:center;vertical-align:middle;">R</td>
        <td style="padding-left:10px;font-size:16px;font-weight:600;color:${TEXT};">${PRODUCT_NAME}</td>
      </tr></table>
    </td></tr>
    <tr><td style="background:#ffffff;border:1px solid ${BORDER};border-radius:12px;padding:32px 28px;">
      <h1 style="margin:0 0 16px;font-size:20px;line-height:28px;font-weight:700;color:${TEXT};">${escapeHtml(content.heading)}</h1>
      ${paragraphs}${button}${footnote}
    </td></tr>
    <tr><td style="padding:16px 4px;font-size:12px;line-height:18px;color:${SUBTLE};">
      ${escapeHtml(PRODUCT_FULL_NAME)} · Lead management for real-estate developers and channel partners.<br>
      ${escapeHtml(content.reason ?? `You received this because of an action in a ${PRODUCT_NAME} workspace.`)} © ${new Date().getFullYear()} ${escapeHtml(COMPANY_NAME)}.
    </td></tr>
  </table>
</td></tr></table>
</body></html>`

  const text = [
    content.heading,
    '',
    ...content.paragraphs.map((p) => p.replace(/\*\*(.+?)\*\*/g, '$1')),
    ...(cta ? ['', `${cta.label}: ${cta.url}`] : []),
    ...(content.footnote ? ['', content.footnote.replace(/\*\*(.+?)\*\*/g, '$1')] : []),
    '',
    '—',
    PRODUCT_FULL_NAME,
  ].join('\n')

  return { html, text }
}

const ROLE_LABEL: Record<string, string> = {
  owner: 'an owner', admin: 'an administrator', manager: 'a sales manager', sales_exec: 'a sales executive', readonly: 'a read-only member',
}

export function invitationEmail(o: { orgName: string; role: string; inviteUrl: string; inviterName?: string }) {
  const inviter = o.inviterName?.trim() || 'An administrator'
  const role = ROLE_LABEL[o.role] ?? `a ${o.role}`
  return {
    subject: `${inviter} invited you to ${o.orgName} on ${PRODUCT_NAME}`,
    ...renderEmail({
      preheader: `Join ${o.orgName} on ${PRODUCT_NAME} — the invitation expires in 7 days.`,
      heading: `Join ${o.orgName} on ${PRODUCT_NAME}`,
      paragraphs: [
        `${inviter} has invited you to join **${o.orgName}** as ${role}.`,
        `${PRODUCT_NAME} is where your team captures every property enquiry, gets it to the right salesperson in seconds and follows up until it closes.`,
      ],
      cta: { label: 'Accept invitation', url: o.inviteUrl },
      footnote: 'This invitation is for your email address only and expires in 7 days. If you weren’t expecting it, you can ignore this email — nothing happens unless you accept.',
    }),
  }
}
