// lib/email/service.ts — the application's ONE way to send e-mail (server only).
//
//   queueEmail()     record an e-mail in the outbox (idempotent). Use inside the business flow, right after its write.
//   sendEmailNow()   queueEmail() + an immediate first attempt. If it doesn't go out now it stays queued (or held) and
//                    the delivery job retries it — nothing is ever dropped.
//   deliverDue()     the 'email.deliver' job: claims due rows (SKIP LOCKED; expired claims are recovered), renders the
//                    template, sends with the sender read from configuration NOW, and records the outcome.
//   emailHealth()    counts for the admin page (no recipients' details, no payloads, no credentials).
//
// Outcomes: sent · queued again with exponential backoff (transient) · failed (permanent, or retries exhausted) ·
// held (sender/provider configuration invalid; re-checked every 5 minutes and released as soon as it is valid) ·
// cancelled (nothing to send any more). Held and failed e-mails raise an hourly alert to the Platform Owners.
import crypto from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getEmailAdapter, type EmailErrorKind } from '@/lib/email/adapter'
import { getEmailConfig, maskAddress, sanitizeError } from '@/lib/email/config'
import { renderTemplate, TemplateError } from '@/lib/email/templates'
import { orgSender } from '@/lib/dal/domains'
import { encryptCredential } from '@/lib/integrations/crypto'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, 'public', any>
export type EmailCategory = 'auth' | 'account' | 'report' | 'buyer' | 'sales' | 'staff' | 'marketing'

export interface QueueEmailInput {
  orgId: string | null
  category: EmailCategory
  template: string
  to: string
  payload: Record<string, unknown>
  /** Same key → same e-mail (a second call is a no-op). Derive it from the business event, e.g. "invite:<id>:<n>". */
  idempotencyKey: string
  sendAfter?: Date
}

export type DeliveryOutcome = 'sent' | 'queued' | 'held' | 'failed' | 'cancelled' | 'not_claimed'
export interface SendResult { id: string | null; outcome: DeliveryOutcome; error?: string }

const workerId = () => `w-${process.env.VERCEL_DEPLOYMENT_ID?.slice(-8) ?? 'local'}-${crypto.randomBytes(4).toString('hex')}`

/** Encrypt a secret value for a payload (e.g. an invitation link). Decrypted only by the template, only to send. */
export const sealForPayload = (value: string) => encryptCredential(value)

export async function queueEmail(db: Db, e: QueueEmailInput): Promise<string | null> {
  const { data, error } = await db.rpc('enqueue_email', {
    p_org: e.orgId, p_category: e.category, p_template: e.template, p_recipient: e.to, p_payload: e.payload,
    p_idempotency_key: e.idempotencyKey, p_send_after: (e.sendAfter ?? new Date()).toISOString(),
  } as never)
  if (error) { console.error('[email] could not queue:', e.template, sanitizeError(error.message)); return null }
  return (data as string | null) ?? null
}

export async function sendEmailNow(db: Db, e: QueueEmailInput): Promise<SendResult> {
  const id = await queueEmail(db, e)
  if (!id) return { id: null, outcome: 'failed', error: 'The e-mail could not be queued.' }
  return deliverOne(db, id)
}

type Row = { id: string; org_id: string | null; template: string; recipient: string; payload: Record<string, unknown>; idempotency_key: string; attempts: number; max_attempts: number }

/** Deliver one specific row now, if it is due (used for the immediate first attempt). */
export async function deliverOne(db: Db, id: string, worker = workerId()): Promise<SendResult> {
  const { data, error } = await db.rpc('claim_email', { p_id: id, p_worker: worker, p_lock_seconds: 120 } as never)
  if (error) return { id, outcome: 'queued', error: sanitizeError(error.message) }
  const row = ((data as Row[] | null) ?? [])[0]
  if (!row) return { id, outcome: 'not_claimed' } // already sent, or another worker has it
  return attempt(db, row, worker)
}

async function attempt(db: Db, row: Row, worker: string): Promise<SendResult> {
  const fail = async (kind: EmailErrorKind | 'skipped', message: string): Promise<SendResult> => {
    const { data } = await db.rpc('fail_email', { p_id: row.id, p_worker: worker, p_kind: kind, p_error: sanitizeError(message) } as never)
    const status = (data as DeliveryOutcome | null) ?? 'queued'
    if (kind !== 'skipped') console.warn(`[email] ${row.template} → ${maskAddress(row.recipient)}: ${kind}: ${sanitizeError(message)} (now ${status})`)
    return { id: row.id, outcome: status, error: sanitizeError(message) }
  }

  // 1. Configuration — read now, never stored on the row.
  const config = getEmailConfig()
  if (config.problems.length) return fail('config', config.problems.join(' '))

  // 2. Render for this row's organisation.
  let rendered
  try {
    rendered = await renderTemplate(row.template, row.payload ?? {}, { db, orgId: row.org_id })
  } catch (err) {
    if (err instanceof TemplateError) return fail(err.kind, err.message)
    return fail('transient', err instanceof Error ? err.message : 'rendering failed')
  }
  if ('skip' in rendered) return fail('skipped', rendered.skip)

  // 3. Send, with the outbox key as the provider's idempotency key. Buyer-facing e-mail goes from the workspace's own
  // verified domain when it has one (20260103); otherwise from RE’s configured sender.
  const own = rendered.fromOwn && row.org_id ? await orgSender(db, row.org_id).catch(() => null) : null
  const result = await getEmailAdapter().sendEmail({
    ...(own ? { from: own } : {}),
    to: row.recipient, subject: rendered.subject, html: rendered.html, text: rendered.text,
    ...(rendered.replyTo ? { replyTo: rendered.replyTo } : {}), idempotencyKey: row.idempotency_key,
  })
  if (!result.success) return fail(result.errorKind ?? 'transient', result.error ?? 'send failed')

  const { data: ok } = await db.rpc('complete_email', { p_id: row.id, p_worker: worker, p_provider: result.provider ?? 'unknown', p_message_id: result.id ?? '' } as never)
  if (ok && row.template === 'invitation' && typeof row.payload?.invitationId === 'string') {
    // Keep the invitation's own delivery state in step (shown to admins on the invitation).
    await db.from('org_invitations').update({ delivery_status: 'delivered', last_delivery_error: null, delivery_updated_at: new Date().toISOString() } as never).eq('id', row.payload.invitationId)
  }
  return { id: row.id, outcome: ok ? 'sent' : 'not_claimed' }
}

/** The 'email.deliver' job. Runs until nothing is due or the time budget is used. */
export async function deliverDue(db: Db, opts: { limit?: number; budgetMs?: number } = {}) {
  const worker = workerId()
  const started = Date.now()
  const summary = { claimed: 0, sent: 0, retried: 0, held: 0, failed: 0, cancelled: 0 }
  // Held e-mails go back in the queue as soon as the configuration is valid again.
  if (getEmailConfig().problems.length === 0) await db.rpc('requeue_emails', { p_ids: null, p_include_failed: false } as never)
  while (Date.now() - started < (opts.budgetMs ?? 20_000)) {
    const { data, error } = await db.rpc('claim_emails', { p_limit: opts.limit ?? 20, p_worker: worker, p_lock_seconds: 120 } as never)
    if (error) throw new Error(`claim_emails failed: ${error.message}`)
    const rows = (data as Row[] | null) ?? []
    if (!rows.length) break
    summary.claimed += rows.length
    let configBroken = false
    for (const row of rows) {
      const r = await attempt(db, row, worker)
      if (r.outcome === 'held') configBroken = true
      if (r.outcome === 'sent') summary.sent++
      else if (r.outcome === 'queued') summary.retried++
      else if (r.outcome === 'held') summary.held++
      else if (r.outcome === 'failed') summary.failed++
      else if (r.outcome === 'cancelled') summary.cancelled++
    }
    if (configBroken && getEmailConfig().problems.length > 0) break // configuration invalid: everything waits until it is fixed
  }
  await alertIfNeeded(db)
  return summary
}

export interface EmailHealth {
  config: { provider: string; from: string | null; replyTo: string | null; apiKeyPresent: boolean; problems: string[]; source: { from: string; provider: string } }
  counts: Record<'queued' | 'sending' | 'sent' | 'held' | 'failed' | 'cancelled', number>
  sentLast24h: number
  attention: { id: string; template: string; recipient: string; org: string | null; status: string; attempts: number; error: string | null; errorKind: string | null; updatedAt: string }[]
}

/** For the admin page. Recipients are masked; payloads and credentials never leave the server. */
export async function emailHealth(db: Db): Promise<EmailHealth> {
  const c = getEmailConfig()
  const counts = { queued: 0, sending: 0, sent: 0, held: 0, failed: 0, cancelled: 0 }
  await Promise.all((Object.keys(counts) as (keyof typeof counts)[]).map(async (s) => {
    const { count } = await db.from('email_outbox').select('id', { count: 'exact', head: true }).eq('status', s)
    counts[s] = count ?? 0
  }))
  const { count: last24 } = await db.from('email_outbox').select('id', { count: 'exact', head: true }).eq('status', 'sent').gte('sent_at', new Date(Date.now() - 86_400_000).toISOString())
  const { data: rows } = await db.from('email_outbox').select('id, template, recipient, org_id, status, attempts, last_error, last_error_kind, updated_at').in('status', ['held', 'failed']).order('updated_at', { ascending: false }).limit(50)
  const orgIds = [...new Set((rows ?? []).map((r: { org_id: string | null }) => r.org_id).filter(Boolean))] as string[]
  const { data: orgs } = orgIds.length ? await db.from('organisations').select('id, name').in('id', orgIds) : { data: [] }
  const name = new Map((orgs ?? []).map((o: { id: string; name: string }) => [o.id, o.name]))
  return {
    config: { provider: c.provider, from: c.from, replyTo: c.replyTo, apiKeyPresent: c.apiKeyPresent, problems: c.problems, source: c.source },
    counts, sentLast24h: last24 ?? 0,
    attention: (rows ?? []).map((r: { id: string; template: string; recipient: string; org_id: string | null; status: string; attempts: number; last_error: string | null; last_error_kind: string | null; updated_at: string }) => ({
      id: r.id, template: r.template, recipient: maskAddress(r.recipient), org: r.org_id ? name.get(r.org_id) ?? 'Workspace' : null,
      status: r.status, attempts: r.attempts, error: r.last_error, errorKind: r.last_error_kind, updatedAt: r.updated_at,
    })),
  }
}

/** At most once an hour: tell the Platform Owners that e-mails are held or failed (counts only). The alert itself is
 *  an outbox e-mail, so if the configuration is broken it waits with the others — the console shows it meanwhile. */
async function alertIfNeeded(db: Db) {
  const [{ count: held }, { count: failed }] = await Promise.all([
    db.from('email_outbox').select('id', { count: 'exact', head: true }).eq('status', 'held').neq('template', 'staff.email_health'),
    db.from('email_outbox').select('id', { count: 'exact', head: true }).eq('status', 'failed').neq('template', 'staff.email_health').gte('updated_at', new Date(Date.now() - 86_400_000).toISOString()),
  ])
  if (!held && !failed) return
  console.error(`[email] attention needed: ${held ?? 0} held, ${failed ?? 0} failed in the last 24 h`)
  const { data: owners } = await db.from('platform_users').select('user_id').eq('role', 'super_admin').eq('is_active', true)
  const hour = new Date().toISOString().slice(0, 13)
  for (const o of owners ?? []) {
    const { data } = await db.auth.admin.getUserById(o.user_id)
    const email = data?.user?.email
    if (!email) continue
    await queueEmail(db, { orgId: null, category: 'staff', template: 'staff.email_health', to: email, payload: { held: held ?? 0, failed: failed ?? 0 }, idempotencyKey: `email-health:${hour}:${o.user_id}` })
  }
}

/** An invitation e-mail through the outbox. The link (it carries the one-time token) is stored only encrypted. A new
 *  link for the same invitation is a new e-mail; the same link twice is the same e-mail. Returns the dispatch result
 *  in the shape the invitation routes already use. */
export async function sendInvitation(db: Db, i: { orgId: string; invitationId: string; to: string; orgName: string; role: string; inviteUrl: string; inviterName?: string }) {
  const linkId = crypto.createHash('sha256').update(i.inviteUrl).digest('hex').slice(0, 16)
  const r = await sendEmailNow(db, {
    orgId: i.orgId, category: 'auth', template: 'invitation', to: i.to, idempotencyKey: `invite:${i.invitationId}:${linkId}`,
    payload: { invitationId: i.invitationId, orgName: i.orgName, role: i.role, inviterName: i.inviterName ?? null, inviteUrlEnc: sealForPayload(i.inviteUrl) },
  })
  const success = r.outcome === 'sent'
  const error = success ? undefined
    : r.outcome === 'held' ? `E-mail is not configured correctly, so the invitation is waiting and will be sent once it is fixed (${r.error ?? 'configuration'}).`
    : r.outcome === 'queued' ? `The invitation e-mail could not be sent yet and will be retried automatically (${r.error ?? 'temporary error'}).`
    : r.error ?? 'The invitation e-mail could not be sent.'
  return { success, error, outcome: r.outcome }
}
