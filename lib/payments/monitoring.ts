// lib/payments/monitoring.ts — payment alerts. Runs with the health-check job (every 5 minutes): each condition below
// opens an alert (payment_alerts), which is emailed to the Platform Owner and finance staff when it opens and daily while
// it stays open, and resolves itself when the condition clears. Shown in Platform Admin → Payments.
import type { EmailAdapter } from '@/lib/email/adapter'
import type { Db } from './registry'

export type AlertKind = 'gateway_unhealthy' | 'webhook_failures' | 'invalid_signatures' | 'stuck_checkouts' | 'unapplied_money'
  | 'dispute_deadline' | 'refund_failed' | 'refund_stuck' | 'reconciliation_exceptions' | 'gst_unconfigured'

export interface Condition { kind: AlertKind; scope: string; active: boolean; detail: string }

const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
const H = 3_600_000, D = 86_400_000

/** Evaluates every condition from the database (no provider calls). */
export async function evaluateConditions(db: Db): Promise<Condition[]> {
  const out: Condition[] = []
  const { data: gateways } = await db.from('payment_gateway_configs').select('provider, environment, status').neq('status', 'disabled')
  for (const g of gateways ?? []) {
    const scope = `${g.provider}:${g.environment}`
    const { data: checks } = await db.from('payment_gateway_health_checks').select('ok, error').eq('provider', g.provider).eq('environment', g.environment).order('checked_at', { ascending: false }).limit(3)
    const failing = (checks ?? []).length === 3 && (checks ?? []).every((c) => !c.ok)
    out.push({ kind: 'gateway_unhealthy', scope, active: failing, detail: failing ? `${g.provider} (${g.environment}) failed its last 3 health checks: ${checks?.[0]?.error ?? 'unknown error'}` : '' })
    const { count: invalid } = await db.from('payment_webhook_events').select('id', { count: 'exact', head: true }).eq('provider', g.provider).eq('environment', g.environment).eq('signature_valid', false).gte('received_at', ago(H))
    out.push({ kind: 'invalid_signatures', scope, active: (invalid ?? 0) >= 5, detail: `${invalid} webhook calls with an invalid signature in the last hour (secret mismatch or forged calls)` })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const counts = async (table: string, f: (q: any) => any) => {
    const { count } = await f(db.from(table).select('id', { count: 'exact', head: true }))
    return (count as number | null) ?? 0
  }
  const exhausted = await counts('payment_webhook_events', (q) => q.eq('outcome', 'failed').gte('attempts', 5))
  out.push({ kind: 'webhook_failures', scope: '', active: exhausted > 0, detail: `${exhausted} signed webhook event(s) still failing after 5 attempts — re-process them from Platform Admin once the cause is fixed` })
  const stuck = await counts('payment_attempts', (q) => q.in('status', ['created', 'pending']).lt('created_at', ago(2 * H)).gt('created_at', ago(2 * D)))
  out.push({ kind: 'stuck_checkouts', scope: '', active: stuck >= 3, detail: `${stuck} checkouts unconfirmed for over 2 hours — check the provider dashboard and webhook delivery` })
  const unapplied = await counts('unapplied_payments', (q) => q.eq('status', 'open').lt('created_at', ago(D)))
  out.push({ kind: 'unapplied_money', scope: '', active: unapplied > 0, detail: `${unapplied} payment(s) received but not applied for over a day — refund or resolve them` })
  const disputes = await counts('payment_disputes', (q) => q.in('status', ['open', 'under_review']).lt('respond_by', new Date(Date.now() + 3 * D).toISOString()))
  out.push({ kind: 'dispute_deadline', scope: '', active: disputes > 0, detail: `${disputes} dispute(s) must be answered within 3 days` })
  const refundFailed = await counts('payment_refunds', (q) => q.eq('status', 'failed').gte('completed_at', ago(7 * D)))
  out.push({ kind: 'refund_failed', scope: '', active: refundFailed > 0, detail: `${refundFailed} refund(s) failed at the provider in the last 7 days — the customer has not been paid back` })
  const refundStuck = await counts('payment_refunds', (q) => q.eq('status', 'submitted').lt('submitted_at', ago(3 * D)))
  out.push({ kind: 'refund_stuck', scope: '', active: refundStuck > 0, detail: `${refundStuck} refund(s) submitted over 3 days ago without a final result` })
  const recon = await counts('payment_reconciliation_items', (q) => q.eq('status', 'open').neq('kind', 'matched').lt('created_at', ago(2 * D)))
  out.push({ kind: 'reconciliation_exceptions', scope: '', active: recon > 0, detail: `${recon} reconciliation exception(s) open for over 2 days` })
  const { data: s } = await db.from('billing_settings').select('supplier_gstin, supplier_state_code, sac_code, supplier_legal_name').single()
  const missing = gstMissing(s)
  const paying = await counts('org_subscriptions', (q) => q.in('status', ['active', 'past_due']))
  out.push({ kind: 'gst_unconfigured', scope: '', active: missing.length > 0 && paying > 0, detail: `Invoices to paying customers lack: ${missing.join(', ')}. Ask the accountant and enter them in Platform Admin → Payments.` })
  return out
}

/** Which supplier GST particulars are still missing (accountant-supplied; never assumed). */
export function gstMissing(s: { supplier_gstin?: string | null; supplier_state_code?: string | null; sac_code?: string | null; supplier_legal_name?: string | null } | null): string[] {
  const m: string[] = []
  if (!s?.supplier_legal_name) m.push('supplier legal name')
  if (!s?.supplier_gstin) m.push('supplier GSTIN')
  if (!s?.supplier_state_code) m.push('supplier state code')
  if (!s?.sac_code) m.push('SAC code')
  return m
}

/** Raise or resolve every alert; email newly opened (and daily open) alerts to the Platform Owner and finance staff. */
export async function runAlerts(db: Db, email: EmailAdapter | null = null): Promise<{ open: number; notified: number }> {
  const notify: Condition[] = []
  let open = 0
  for (const c of await evaluateConditions(db)) {
    if (c.active) {
      open++
      const { data } = await db.rpc('payment_alert_raise', { p_kind: c.kind, p_scope: c.scope, p_detail: c.detail })
      if (data === true) notify.push(c)
    } else {
      await db.rpc('payment_alert_resolve', { p_kind: c.kind, p_scope: c.scope })
    }
  }
  if (notify.length) await emailStaff(db, email, notify)
  return { open, notified: notify.length }
}

async function emailStaff(db: Db, email: EmailAdapter | null, alerts: Condition[]) {
  const { data: staff } = await db.from('platform_users').select('user_id').in('role', ['super_admin', 'finance_admin']).eq('is_active', true)
  const to: string[] = []
  for (const s of staff ?? []) {
    const { data } = await db.auth.admin.getUserById(s.user_id)
    if (data?.user?.email) to.push(data.user.email)
  }
  if (!to.length) { console.error('[payments] alerts open but no Platform Owner or finance staff to notify:', alerts.map((a) => a.kind).join(', ')); return }
  const payload = { alerts: alerts.map((a) => ({ kind: a.kind, scope: a.scope ?? null, detail: a.detail })) }
  if (email) { // tests pass a mailer
    const { renderTemplate } = await import('@/lib/email/templates')
    const m = await renderTemplate('payments.alerts', payload, { db, orgId: null })
    if (!('skip' in m)) await email.sendEmail({ to, subject: m.subject, html: m.html, text: m.text })
    return
  }
  const { queueEmail, deliverOne } = await import('@/lib/email/service')
  const day = new Date().toISOString().slice(0, 10)
  const kinds = alerts.map((a) => `${a.kind}${a.scope ? `@${a.scope}` : ''}`).sort().join(',')
  const digest = (await import('node:crypto')).createHash('sha256').update(kinds).digest('hex').slice(0, 16)
  for (const addr of to) {
    const id = await queueEmail(db, { orgId: null, category: 'staff', template: 'payments.alerts', to: addr, payload, idempotencyKey: `payment-alerts:${day}:${digest}:${addr.toLowerCase()}` })
    if (id) await deliverOne(db, id)
  }
}
