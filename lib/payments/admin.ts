// lib/payments/admin.ts — data for the Platform Admin payments console. Staff only (checked by the caller):
// finance admins, the Platform Owner (super_admin) and auditors (read-only). Never returns secrets.
import type { Db } from './registry'

export const PAYMENT_STAFF = ['super_admin', 'finance_admin', 'auditor'] as const
export const PAYMENT_OPERATORS = ['super_admin', 'finance_admin'] as const

export async function paymentsOverview(db: Db, environment: 'test' | 'live') {
  const since24h = new Date(Date.now() - 86_400_000).toISOString()
  const since7d = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const stale = new Date(Date.now() - 30 * 60_000).toISOString()
  const [gateways, settings, events, attempts, refunds, approvals, unapplied, disputes, recon, outages, mandates, alerts] = await Promise.all([
    db.from('payment_gateway_configs').select('provider, environment, status, is_primary, public_key_id, last_webhook_at, last_health_at, last_health_ok, last_health_error, notes, updated_at').order('environment').order('provider'),
    db.from('billing_settings').select('refund_second_approval_above_cents, outage_grace_days, recurring_payments_enabled, gst_rate_bps, sac_code, supplier_state_code, supplier_gstin, supplier_legal_name').single(),
    db.from('payment_webhook_events').select('provider, environment, outcome, signature_valid, received_at').gte('received_at', since24h),
    db.from('payment_attempts').select('provider, environment, status, created_at').gte('created_at', since7d),
    db.from('payment_refunds').select('id, provider, environment, provider_payment_id, amount_cents, currency, reason, approvals_required, status, requested_by, requested_at, provider_refund_id, failure_reason, org_id, credit_note_id').order('requested_at', { ascending: false }).limit(50),
    db.from('payment_refund_approvals').select('refund_id, approver, decision, decided_at'),
    db.from('unapplied_payments').select('id, provider, environment, provider_payment_id, amount_cents, currency, reason, status, org_id, created_at').in('status', ['open', 'refund_requested']).order('created_at', { ascending: false }),
    db.from('payment_disputes').select('id, provider, provider_dispute_id, provider_payment_id, amount_cents, status, respond_by, org_id').in('status', ['open', 'under_review']).order('respond_by', { ascending: true }),
    db.from('payment_reconciliation_items').select('id, kind, provider_payment_id, expected_cents, actual_cents, created_at, run_id').eq('status', 'open').neq('kind', 'matched').order('created_at', { ascending: false }).limit(100),
    db.from('payment_provider_outages').select('id, provider, environment, started_at, ended_at, evidence, grace_days, affected, verified_at').order('verified_at', { ascending: false }).limit(20),
    db.from('payment_mandates').select('status'),
    db.from('payment_alerts').select('id, kind, scope, detail, opened_at, last_seen_at').is('resolved_at', null).order('opened_at', { ascending: false }),
  ])
  const ev = events.data ?? [], at = attempts.data ?? []
  const health = (gateways.data ?? []).map((g) => {
    const mine = at.filter((a) => a.provider === g.provider && a.environment === g.environment)
    const done = mine.filter((a) => ['captured', 'failed', 'expired'].includes(a.status))
    return {
      ...g,
      webhookFailures24h: ev.filter((e) => e.provider === g.provider && e.environment === g.environment && e.outcome === 'failed').length,
      invalidSignatures24h: ev.filter((e) => e.provider === g.provider && e.environment === g.environment && !e.signature_valid).length,
      stuckAttempts: mine.filter((a) => ['created', 'pending'].includes(a.status) && a.created_at < stale).length,
      successRate7d: done.length ? Math.round((100 * done.filter((a) => a.status === 'captured').length) / done.length) : null,
    }
  })
  const approvalsBy = new Map<string, { approver: string; decision: string }[]>()
  for (const a of approvals.data ?? []) approvalsBy.set(a.refund_id, [...(approvalsBy.get(a.refund_id) ?? []), a])
  return {
    environment,
    settings: settings.data,
    alerts: alerts.data ?? [],
    gateways: health,
    refunds: (refunds.data ?? []).map((r) => ({ ...r, approvals: approvalsBy.get(r.id) ?? [] })),
    unapplied: unapplied.data ?? [],
    disputes: disputes.data ?? [],
    reconciliation: recon.data ?? [],
    outages: outages.data ?? [],
    mandates: Object.entries((mandates.data ?? []).reduce<Record<string, number>>((m, x) => ({ ...m, [x.status]: (m[x.status] ?? 0) + 1 }), {})),
  }
}
export type PaymentsOverview = Awaited<ReturnType<typeof paymentsOverview>>
