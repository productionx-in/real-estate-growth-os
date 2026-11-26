// lib/email/templates.ts — every application e-mail, by name. The outbox stores a template name and a JSON payload;
// the message is rendered here at DELIVERY time, so template fixes and the app address apply to queued e-mails too.
//
// Rules for payloads:
//   * keys ending in "Path" are app paths; they become full URLs (key without "Path") using the CURRENT app address;
//   * secrets (an invitation link carries a one-time token) are stored only encrypted ("…Enc", lib/integrations/crypto);
//   * anything read from the database is read for the outbox row's own organisation (tenant check) — a payload that
//     points at another organisation's record is refused, never rendered.
// A renderer returns { skip } when there is nothing to send any more (e.g. a cancelled site visit): the row is then
// cancelled, not retried.
import type { SupabaseClient } from '@supabase/supabase-js'
import { invitationEmail, renderEmail } from '@/lib/email/layout'
import { customerEmails, type CustomerEmailKind } from '@/lib/email/customer'
import { managerDayEmail, memberDayEmail } from '@/lib/email/daily-report'
import { weeklyDigestEmail } from '@/lib/email/weekly-digest'
import { demoAlertEmail, demoConfirmationEmail, type DemoRequestDetails } from '@/lib/email/demo-request'
import { decryptCredential } from '@/lib/integrations/crypto'
import { appUrl, siteUrl } from '@/lib/site/urls'
import { personalise } from '@/lib/campaigns/rules'
import { listingFromRow } from '@/lib/listings/listing'
import { ownerEmailContent, type OwnerEmailKind } from '@/lib/listings/owner-email'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, 'public', any>
/** fromOwn: a buyer-facing e-mail, sent from the workspace's own verified domain when it has one (20260103). */
export interface Rendered { subject: string; html: string; text?: string; replyTo?: string; fromOwn?: boolean }
export type RenderResult = Rendered | { skip: string }
export interface RenderContext { db: Db; orgId: string | null }
type Payload = Record<string, unknown>

/** { urlPath: '/x' } → { url: 'https://app/x' } using the app address at delivery time. */
export function resolvePaths<T extends Payload>(p: T, base = appUrl()): Payload {
  if (!base) throw new TemplateError('config', 'The app address is not configured (NEXT_PUBLIC_APP_URL), so links cannot be built.')
  const out: Payload = {}
  for (const [k, v] of Object.entries(p)) {
    if (k.endsWith('Path') && typeof v === 'string' && v.startsWith('/')) out[k.slice(0, -4)] = `${base}${v}`
    else if (/(^|[a-z])(url|Url)$/.test(k) && typeof v === 'string' && v.startsWith('/')) out[k] = `${base}${v}` // a bare app path in a link field
    else out[k] = v
  }
  return out
}

/** A rendering problem the outbox should classify (config → hold; permanent → fail). */
export class TemplateError extends Error {
  constructor(public kind: 'config' | 'permanent', message: string) { super(message) }
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

const RENDERERS: Record<string, (p: Payload, ctx: RenderContext) => Promise<RenderResult> | RenderResult> = {
  // Invitation to a workspace. The link holds a one-time token: stored encrypted, decrypted only to send.
  async invitation(p, { db, orgId }) {
    const { data: inv } = await db.from('org_invitations').select('id, org_id, status').eq('id', str(p.invitationId)).maybeSingle()
    if (!inv || inv.org_id !== orgId) throw new TemplateError('permanent', 'Invitation not found in this organisation.')
    if (inv.status !== 'pending') return { skip: `invitation is ${inv.status}` }
    let inviteUrl: string
    try { inviteUrl = decryptCredential(str(p.inviteUrlEnc)) } catch { throw new TemplateError('permanent', 'The invitation link could not be decrypted; issue a new link.') }
    return invitationEmail({ orgName: str(p.orgName), role: str(p.role), inviteUrl, inviterName: str(p.inviterName) || undefined })
  },

  // Account e-mails (welcome, trial, invoice, payment, workspace state, plan active, team welcome).
  customer(p) {
    const kind = str(p.kind) as CustomerEmailKind
    const fn = (customerEmails as unknown as Record<string, (a: Payload) => Rendered>)[kind]
    if (!fn) throw new TemplateError('permanent', `Unknown customer e-mail "${kind}".`)
    return fn(resolvePaths((p.args ?? {}) as Payload))
  },

  'daily.member'(p) {
    return memberDayEmail(resolvePaths((p.args ?? {}) as Payload) as unknown as Parameters<typeof memberDayEmail>[0])
  },
  'daily.manager'(p) {
    return managerDayEmail(resolvePaths((p.args ?? {}) as Payload) as unknown as Parameters<typeof managerDayEmail>[0])
  },
  'weekly.manager'(p) {
    return weeklyDigestEmail(resolvePaths((p.args ?? {}) as Payload) as unknown as Parameters<typeof weeklyDigestEmail>[0])
  },

  'demo.confirmation'(p) {
    const site = siteUrl() ?? appUrl()
    if (!site) throw new TemplateError('config', 'The site address is not configured.')
    return demoConfirmationEmail(p.details as DemoRequestDetails, { site })
  },
  'demo.alert'(p) {
    const base = appUrl()
    if (!base) throw new TemplateError('config', 'The app address is not configured.')
    const d = p.details as DemoRequestDetails
    return { ...demoAlertEmail(d, { console: `${base}/platform/sales?stage=new` }), ...(d.email ? { replyTo: d.email } : {}) }
  },

  // A buyer's site-visit confirmation or reminder. Re-checked at delivery: a moved or cancelled visit is skipped.
  async site_visit(p, { db, orgId }) {
    const { renderSiteVisit } = await import('@/lib/jobs/site-visit-notify')
    const r = await renderSiteVisit(db, orgId, p)
    return 'skip' in r ? r : { ...r, fromOwn: true }
  },

  'payments.alerts'(p) {
    const alerts = (p.alerts ?? []) as { kind: string; scope?: string | null; detail: string }[]
    const app = appUrl()
    return {
      subject: `REGrow payments: ${alerts.length} alert(s)`,
      ...renderEmail({
        preheader: `${alerts.length} payment alert(s) need attention`,
        heading: 'Payment alerts',
        paragraphs: alerts.map((a) => `**${a.kind.replace(/_/g, ' ')}${a.scope ? ` (${a.scope})` : ''}:** ${a.detail}`),
        ...(app ? { cta: { label: 'Open Platform Admin → Payments', url: `${app}/platform/payments` } } : {}),
        footnote: 'You receive this as Platform Owner or finance staff. Each alert repeats daily while it stays open.',
      }),
    }
  },
  'payments.debit_notice'(p) {
    const rupees = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100)
    const when = new Intl.DateTimeFormat('en-IN', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(str(p.debitAfter)))
    const amount = rupees(Number(p.amountPaise ?? 0))
    return {
      subject: `Upcoming REGrow payment of ${amount}`,
      ...renderEmail({
        preheader: `${amount} will be debited for your REGrow renewal`,
        heading: 'Upcoming automatic payment',
        paragraphs: [
          `Your REGrow subscription for ${str(p.orgName) || 'your workspace'} renews soon. ${amount} (including GST) will be debited through your UPI AutoPay mandate on or after ${when}.`,
          'You can cancel the mandate at any time from Plan & billing in REGrow, or from your UPI app. If you cancel, you can still pay the renewal invoice manually.',
        ],
      }),
    }
  },

  // A marketing campaign (lib/dal/campaigns.ts): rendered from the campaign and recipient of THIS organisation at
  // delivery time, so a cancelled campaign or a late unsubscribe still stops it. Plain text written by the sender,
  // personalised with {{first_name}} only; every value is escaped by the layout.
  async 'campaign.email'(p, { db, orgId }) {
    const { data: r } = await db.from('campaign_recipients').select('id, org_id, campaign_id, address, first_name, unsubscribe_token, status').eq('id', str(p.recipientId)).maybeSingle()
    if (!r || r.org_id !== orgId) throw new TemplateError('permanent', 'Campaign recipient not found in this organisation.')
    const [{ data: c }, { data: sup }, { data: org }, { data: biz }] = await Promise.all([
      db.from('campaigns').select('id, org_id, status, subject, body').eq('id', r.campaign_id).maybeSingle(),
      db.from('marketing_suppressions').select('address').eq('org_id', orgId).eq('channel', 'email').eq('address', r.address).maybeSingle(),
      db.from('organisations').select('name').eq('id', orgId).maybeSingle(),
      db.from('org_business_profiles').select('email').eq('org_id', orgId).maybeSingle(),
    ])
    if (!c || c.org_id !== orgId) throw new TemplateError('permanent', 'Campaign not found in this organisation.')
    if (c.status === 'cancelled') return { skip: 'The campaign was cancelled.' }
    if (sup) return { skip: 'The recipient unsubscribed.' }
    if (!c.subject || !c.body) throw new TemplateError('permanent', 'The campaign has no message.')
    const app = appUrl()
    if (!app) throw new TemplateError('config', 'The app address is not configured (NEXT_PUBLIC_APP_URL), so the unsubscribe link cannot be built.')
    const first = typeof r.first_name === 'string' ? r.first_name : null
    const orgName = str(org?.name) || 'the sender'
    const subject = personalise(c.subject, first).slice(0, 200)
    return {
      subject, fromOwn: true,
      replyTo: typeof biz?.email === 'string' ? biz.email : undefined,
      ...renderEmail({
        preheader: subject,
        heading: subject,
        paragraphs: personalise(c.body, first).split(/\n\s*\n/).map((x: string) => x.trim()).filter(Boolean),
        reason: `You received this from ${orgName} because you enquired about their properties.`,
        unsubscribeUrl: `${app}/u/${r.unsubscribe_token}`,
      }),
    }
  },

  // An agency to a property's owner about their listing (lib/listings/owner-email.ts). Rendered from the listing as it is
  // now; skipped if the listing is gone or no longer has the owner's e-mail. Replies go to the agency's business e-mail.
  async 'listing.owner'(p, { db, orgId }) {
    const kind = str(p.kind) as OwnerEmailKind
    if (kind !== 'listed' && kind !== 'update') throw new TemplateError('permanent', 'Unknown owner e-mail.')
    const { data: row } = await db.from('listings').select('*').eq('id', str(p.listingId)).maybeSingle()
    if (!row) return { skip: 'The listing was deleted.' }
    if (row.org_id !== orgId) throw new TemplateError('permanent', 'Listing not found in this organisation.')
    if (!row.owner_email) return { skip: 'The listing no longer has the owner’s e-mail.' }
    const [{ data: org }, { data: agent }, { data: biz }] = await Promise.all([
      db.from('organisations').select('name').eq('id', orgId).maybeSingle(),
      db.from('profiles').select('full_name, phone').eq('id', str(p.agentId)).maybeSingle(),
      db.from('org_business_profiles').select('email').eq('org_id', orgId).maybeSingle(),
    ])
    const agency = str(org?.name) || 'our agency'
    const c = ownerEmailContent(kind, listingFromRow(row, true), { agent: str(agent?.full_name) || agency, agentPhone: typeof agent?.phone === 'string' ? agent.phone : null, agency })
    return {
      subject: c.subject, fromOwn: true,
      replyTo: typeof biz?.email === 'string' ? biz.email : undefined,
      ...renderEmail({ preheader: c.subject, heading: c.heading, paragraphs: c.paragraphs, reason: `You received this from ${agency} about the property you listed with them.` }),
    }
  },

  // To REGrow's Platform Owners when e-mails are held (configuration) or failed. Counts only — no customer data.
  'staff.email_health'(p) {
    const app = appUrl()
    const held = Number(p.held ?? 0); const failed = Number(p.failed ?? 0)
    return {
      subject: `REGrow e-mail: ${held ? `${held} held` : ''}${held && failed ? ', ' : ''}${failed ? `${failed} failed` : ''}`.trim(),
      ...renderEmail({
        preheader: 'Some application e-mails need attention.',
        heading: 'E-mail delivery needs attention',
        paragraphs: [
          ...(held ? [`**${held}** e-mail${held === 1 ? ' is' : 's are'} held because the sender or provider configuration is invalid. They are kept and will go out automatically once it is fixed.`] : []),
          ...(failed ? [`**${failed}** e-mail${failed === 1 ? '' : 's'} failed permanently (for example an invalid recipient address).`] : []),
          'Details and a retry button are in Platform Admin → E-mail.',
        ],
        ...(app ? { cta: { label: 'Open e-mail health', url: `${app}/platform/email` } } : {}),
        reason: 'Sent to REGrow Platform Owners about e-mail delivery.',
      }),
    }
  },
}

export const TEMPLATE_NAMES = Object.keys(RENDERERS)

export async function renderTemplate(template: string, payload: Payload, ctx: RenderContext): Promise<RenderResult> {
  const fn = RENDERERS[template]
  if (!fn) throw new TemplateError('permanent', `Unknown e-mail template "${template}".`)
  return fn(payload, ctx)
}
