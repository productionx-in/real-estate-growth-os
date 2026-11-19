// lib/payments/service.ts — provider-independent payment operations. Every function takes the database client and
// an adapter resolver, so the same code runs in production and in the real-database tests (with recorded provider
// responses). Callers authorise first: customer routes check owner/admin of the organisation; staff routes check
// the platform role (and the database functions check it again).
//
// Rules: amounts come from the invoice, never the browser; a browser return never activates anything without a
// server-to-server check; every provider event is stored before it is processed and processed once; money that
// cannot be applied is recorded as unapplied and refunded through the provider that took it.
import crypto from 'node:crypto'
import { appUrl } from '@/lib/site/urls'
import { primaryAdapter, operableAdapters, type AdapterResolver, type Db } from './registry'
import { ProviderError, type NeutralEvent, type PaymentEnvironment, type ProviderAdapter, type ProviderCode, type ProviderPayment } from './types'

export type Result<T> = { success: true; data: T } | { success: false; error: string; status: number }
const fail = (error: string, status: number): Result<never> => ({ success: false, error, status })

const friendly = (m: string) => m.replace(/^.*?(billing|payments): /, '').replace(/^./, (c) => c.toUpperCase())

// ── Settlement ─────────────────────────────────────────────────────────────────────────────────
export type SettleStatus = 'settled' | 'already_settled' | 'unapplied'

export async function settle(db: Db, provider: ProviderCode, environment: PaymentEnvironment, orderId: string, p: ProviderPayment): Promise<Result<{ status: SettleStatus; orgId: string; invoiceId: string; reason?: string }>> {
  const { data, error } = await db.rpc('billing_settle_payment', {
    p_provider: provider, p_env: environment, p_order_id: orderId, p_payment_id: p.paymentId,
    p_amount_cents: p.amountPaise, p_currency: p.currency, p_method: p.method ?? null,
  })
  if (error) {
    const status = /unknown order/.test(error.message) ? 404 : /billing: /.test(error.message) ? 409 : 500
    return fail(friendly(error.message), status)
  }
  const r = data as { status: SettleStatus; org_id: string; invoice_id: string; reason?: string }
  return { success: true, data: { status: r.status, orgId: r.org_id, invoiceId: r.invoice_id, reason: r.reason } }
}

// ── Checkout ───────────────────────────────────────────────────────────────────────────────────
export interface CheckoutData {
  provider: ProviderCode
  orderId: string
  checkoutSession: string | null
  public: ReturnType<ProviderAdapter['publicCheckout']>
  amountPaise: number
  currency: string
  invoiceNumber: string
}

/**
 * One open attempt per invoice. Reused while it is on the primary provider; if the primary has changed, the old
 * attempt is first checked with its own provider — a captured payment is settled (no second charge), a payment in
 * progress blocks a new checkout, and only a dead attempt is superseded.
 */
export async function checkout(db: Db, resolver: AdapterResolver, input: { orgId: string; invoiceId: string; userId: string; customer: { email?: string | null; phone?: string | null; name?: string | null } }): Promise<Result<CheckoutData | { alreadyPaid: true }>> {
  const { data: inv } = await db.from('org_subscription_invoices').select('id, org_id, invoice_number, amount_cents, currency, status')
    .eq('id', input.invoiceId).eq('org_id', input.orgId).maybeSingle()
  if (!inv) return fail('Invoice not found.', 404)
  if (inv.status !== 'issued') return fail(inv.status === 'paid' ? 'This invoice is already paid.' : 'This invoice can no longer be paid.', 409)

  const primary = await primaryAdapter(db, resolver)
  if (!primary.adapter) return fail('Online payment is not available right now. Please contact us to pay this invoice.', 503)
  const adapter = primary.adapter

  const { data: open } = await db.from('payment_attempts').select('*').eq('invoice_id', inv.id).in('status', ['created', 'pending']).maybeSingle()
  if (open) {
    const fresh = !open.expires_at || new Date(open.expires_at).getTime() > Date.now() + 60_000
    if (open.provider === adapter.code && open.environment === adapter.environment && fresh) {
      await db.from('org_subscription_invoices').update({ checkout_by: input.userId }).eq('id', inv.id).eq('status', 'issued')
      return { success: true, data: { provider: adapter.code, orderId: open.provider_order_id, checkoutSession: open.checkout_session, public: adapter.publicCheckout(), amountPaise: Number(inv.amount_cents), currency: inv.currency, invoiceNumber: inv.invoice_number } }
    }
    const old = resolver.get(open.provider, open.environment)
    if (!old) return fail('A previous payment for this invoice cannot be checked right now. Please try again later or contact us.', 409)
    let payments: ProviderPayment[]
    try { payments = await old.orderPayments(open.provider_order_id) } catch {
      return fail('A previous payment for this invoice cannot be checked right now. Please try again in a few minutes.', 503)
    }
    const captured = payments.find((p) => p.status === 'captured')
    if (captured) {
      const s = await settle(db, old.code, old.environment, open.provider_order_id, captured)
      if (s.success && s.data.status !== 'unapplied') return { success: true, data: { alreadyPaid: true } }
    }
    if (payments.some((p) => p.status === 'authorized' || p.status === 'pending')) {
      return fail('A payment for this invoice is still being processed. Please check again in a few minutes.', 409)
    }
    await db.rpc('payment_attempt_close', { p_attempt: open.id, p_status: fresh ? 'superseded' : 'expired' })
  }

  const reference = `rg_${inv.id.replace(/-/g, '').slice(0, 12)}_${crypto.randomBytes(5).toString('hex')}`
  let order
  try {
    order = await adapter.createOrder({
      reference, invoiceId: inv.id, invoiceNumber: inv.invoice_number, orgId: input.orgId, amountPaise: Number(inv.amount_cents), currency: inv.currency,
      customer: { id: input.userId, ...input.customer },
      returnUrl: appUrl() ? `${appUrl()}/api/billing/payments/return?provider=${adapter.code}&order_id={order_id}` : null,
      notifyUrl: appUrl() ? `${appUrl()}/api/webhooks/${adapter.code}` : null,
    })
  } catch (e) {
    const err = e as ProviderError
    console.error(`[payments] ${adapter.code} order failed:`, err.message)
    return fail(err.retryable === false && err.httpStatus === null ? err.message : 'Could not start the payment. Please try again in a minute.', 502)
  }
  const { error } = await db.rpc('payment_attempt_create', {
    p_invoice: inv.id, p_org: input.orgId, p_provider: adapter.code, p_env: adapter.environment, p_order_id: order.orderId,
    p_session: order.checkoutSession ?? null, p_amount: Number(inv.amount_cents), p_currency: inv.currency, p_actor: input.userId, p_expires: order.expiresAt ?? null,
  })
  if (error) {
    // A concurrent checkout created its attempt first: use that one.
    const { data: again } = await db.from('payment_attempts').select('*').eq('invoice_id', inv.id).in('status', ['created', 'pending']).maybeSingle()
    if (again && again.provider === adapter.code) {
      return { success: true, data: { provider: adapter.code, orderId: again.provider_order_id, checkoutSession: again.checkout_session, public: adapter.publicCheckout(), amountPaise: Number(inv.amount_cents), currency: inv.currency, invoiceNumber: inv.invoice_number } }
    }
    return fail(friendly(error.message), 409)
  }
  return { success: true, data: { provider: adapter.code, orderId: order.orderId, checkoutSession: order.checkoutSession ?? null, public: adapter.publicCheckout(), amountPaise: Number(inv.amount_cents), currency: inv.currency, invoiceNumber: inv.invoice_number } }
}

// ── Confirmation after the browser returns ─────────────────────────────────────────────────────
/** The browser says checkout finished. We verify what it sends, then ask the provider; only the provider's word counts. */
export async function confirm(db: Db, resolver: AdapterResolver, orgId: string, provider: ProviderCode, params: Record<string, unknown>): Promise<Result<{ status: SettleStatus | 'pending' }>> {
  const claimed = typeof params.orderId === 'string' ? params.orderId : typeof params.razorpay_order_id === 'string' ? params.razorpay_order_id : null
  if (!claimed) return fail('Invalid request.', 400)
  const { data: att } = await db.from('payment_attempts').select('id, provider, environment, provider_order_id, org_id').eq('provider', provider).eq('provider_order_id', claimed).maybeSingle()
  let environment: PaymentEnvironment | null = att?.environment ?? null
  if (!att) {
    // Legacy Razorpay order recorded only on the invoice.
    const { data: inv } = await db.from('org_subscription_invoices').select('id, payment_environment').eq('org_id', orgId).eq('gateway', provider).eq('gateway_order_id', claimed).maybeSingle()
    if (!inv) return fail('Invoice not found.', 404)
    environment = inv.payment_environment ?? resolver.environment
  } else if (att.org_id !== orgId) return fail('Invoice not found.', 404)
  const adapter = resolver.get(provider, environment!)
  if (!adapter) return fail('Online payment is not available right now.', 503)
  const ret = adapter.verifyReturn(params)
  if (!ret || ret.orderId !== claimed) return fail('Payment could not be verified.', 400)

  let payments: ProviderPayment[]
  try { payments = await adapter.orderPayments(ret.orderId) } catch (e) {
    console.error(`[payments] ${provider} payment check failed:`, (e as Error).message)
    return fail(`Could not confirm the payment yet. It will update automatically when ${provider === 'razorpay' ? 'Razorpay' : 'Cashfree'} confirms it.`, 502)
  }
  const mine = ret.paymentId ? payments.filter((p) => p.paymentId === ret.paymentId) : payments
  if (ret.paymentId && mine.length === 0) return fail('Payment does not belong to this invoice.', 400)
  const captured = mine.find((p) => p.status === 'captured')
  if (captured) {
    const s = await settle(db, provider, adapter.environment, ret.orderId, captured)
    if (!s.success) return s
    if (s.data.status === 'unapplied') return fail('This payment could not be applied to the invoice; our team will refund it.', 409)
    return { success: true, data: { status: s.data.status } }
  }
  if (mine.some((p) => p.status === 'authorized' || p.status === 'pending')) return { success: true, data: { status: 'pending' } }
  return fail('The payment did not go through.', 402)
}

// ── Webhooks ───────────────────────────────────────────────────────────────────────────────────
export async function handleWebhook(db: Db, adapter: ProviderAdapter | null, rawBody: string, headers: Headers): Promise<{ status: number; body: Record<string, unknown> }> {
  if (!adapter) return { status: 503, body: { error: 'Not configured' } }
  if (rawBody.length > 500_000) return { status: 413, body: { error: 'Too large' } }
  const valid = adapter.verifyWebhook(rawBody, headers)
  if (!valid) {
    const id = `invalid:${crypto.createHash('sha256').update(rawBody).digest('hex')}`
    await db.rpc('payment_webhook_record', { p_provider: adapter.code, p_env: adapter.environment, p_event_id: id, p_type: 'invalid_signature', p_signature_valid: false, p_payload: null })
    return { status: 401, body: { error: 'Invalid signature' } }
  }
  let parsed
  try { parsed = adapter.parseWebhook(rawBody, headers) } catch { return { status: 400, body: { error: 'Invalid payload' } } }
  const { data: rec, error: recErr } = await db.rpc('payment_webhook_record', {
    p_provider: adapter.code, p_env: adapter.environment, p_event_id: parsed.eventId, p_type: parsed.type, p_signature_valid: true, p_payload: JSON.parse(rawBody),
  })
  if (recErr) return { status: 500, body: { error: 'Could not record the event' } }
  const r = rec as { id: string; state: 'new' | 'duplicate' | 'retry' }
  if (r.state === 'duplicate') return { status: 200, body: { ok: true, duplicate: true } }
  const outcome = await processEvent(db, adapter, parsed.event)
  await db.rpc('payment_webhook_outcome', { p_event: r.id, p_outcome: outcome.outcome, p_detail: outcome.detail })
  // Expected refusals are acknowledged (the provider stops retrying; finance sees them); failures ask for a retry.
  return outcome.outcome === 'failed' ? { status: 500, body: { ok: false } } : { status: 200, body: { ok: true, outcome: outcome.outcome } }
}

export async function processEvent(db: Db, adapter: ProviderAdapter, event: NeutralEvent): Promise<{ outcome: 'processed' | 'ignored' | 'refused' | 'failed'; detail: string }> {
  try {
    switch (event.kind) {
      case 'payment.captured': {
        if (!event.payment.orderId) return { outcome: 'refused', detail: 'payment without order' }
        const s = await settle(db, adapter.code, adapter.environment, event.payment.orderId, event.payment)
        if (!s.success) return { outcome: s.status === 500 ? 'failed' : 'refused', detail: s.error }
        return { outcome: 'processed', detail: s.data.status + (s.data.reason ? `:${s.data.reason}` : '') }
      }
      case 'payment.failed': {
        if (event.payment.orderId) {
          const { data: att } = await db.from('payment_attempts').select('id').eq('provider', adapter.code).eq('environment', adapter.environment).eq('provider_order_id', event.payment.orderId).maybeSingle()
          // A failed payment leaves the order open for another try; record that it was attempted.
          if (att) await db.rpc('payment_attempt_close', { p_attempt: att.id, p_status: 'pending' })
        }
        return { outcome: 'processed', detail: 'payment failed' }
      }
      case 'refund.updated': {
        if (event.refund.status === 'pending') return { outcome: 'ignored', detail: 'refund pending' }
        const { data, error } = await db.rpc('payment_refund_result', {
          p_provider: adapter.code, p_env: adapter.environment, p_provider_refund_id: event.refund.refundId,
          p_idempotency_key: event.refund.reference && /^[0-9a-f-]{36}$/.test(event.refund.reference) ? event.refund.reference : null,
          p_status: event.refund.status, p_failure: event.refund.reason ?? null,
        })
        if (error) return { outcome: 'failed', detail: error.message }
        return { outcome: (data as { status: string }).status === 'unknown_refund' ? 'refused' : 'processed', detail: (data as { status: string }).status }
      }
      case 'dispute.updated': {
        const d = event.dispute
        const { data, error } = await db.rpc('payment_dispute_record', {
          p_provider: adapter.code, p_env: adapter.environment, p_dispute_id: d.disputeId, p_payment_id: d.paymentId, p_amount: d.amountPaise,
          p_status: d.status, p_reason: d.reason, p_respond_by: d.respondBy,
        })
        if (error) return { outcome: 'failed', detail: error.message }
        return { outcome: 'processed', detail: (data as { status: string }).status }
      }
      case 'mandate.updated': {
        const { data: m } = await db.from('payment_mandates').select('id').eq('provider', adapter.code).eq('environment', adapter.environment).eq('provider_mandate_id', event.mandate.mandateId).maybeSingle()
        if (!m) return { outcome: 'refused', detail: 'unknown mandate' }
        const { data, error } = await db.rpc('payment_mandate_transition', { p_mandate: m.id, p_to: event.mandate.status, p_source: 'provider', p_actor: null, p_detail: event.mandate.detail })
        if (error) return { outcome: 'failed', detail: error.message }
        return { outcome: 'processed', detail: (data as { status: string }).status }
      }
      case 'mandate.charge': {
        const { data: ch } = await db.from('payment_mandate_charges').select('id, invoice_id, status, mandate_id').eq('provider_charge_id', event.charge.chargeId).maybeSingle()
        if (!ch) return { outcome: 'refused', detail: 'unknown charge' }
        if (ch.status === 'submitted') await db.rpc('payment_mandate_charge_result', { p_charge: ch.id, p_succeeded: event.charge.succeeded, p_failure: event.charge.failure })
        if (event.charge.succeeded && event.charge.payment) {
          // A mandate charge is settled like any payment, against an attempt recorded for the charge.
          const { data: inv } = await db.from('org_subscription_invoices').select('id, org_id, amount_cents, currency, checkout_by').eq('id', ch.invoice_id).single()
          if (!inv) return { outcome: 'failed', detail: 'charge invoice not found' }
          const orderRef = `mandate_${event.charge.chargeId}`
          // The person who authorised the mandate is recorded as the payer of record for the renewal.
          const { data: mandate } = await db.from('payment_mandates').select('created_by').eq('id', ch.mandate_id).single()
          await db.rpc('payment_attempt_create', { p_invoice: inv.id, p_org: inv.org_id, p_provider: adapter.code, p_env: adapter.environment, p_order_id: orderRef, p_session: null, p_amount: Number(inv.amount_cents), p_currency: inv.currency, p_actor: inv.checkout_by ?? mandate?.created_by ?? null, p_expires: null })
          const s = await settle(db, adapter.code, adapter.environment, orderRef, event.charge.payment)
          if (!s.success) return { outcome: s.status === 500 ? 'failed' : 'refused', detail: s.error }
        }
        return { outcome: 'processed', detail: event.charge.succeeded ? 'charge succeeded' : 'charge failed' }
      }
      default:
        return { outcome: 'ignored', detail: event.reason }
    }
  } catch (e) {
    return { outcome: 'failed', detail: (e as Error).message }
  }
}

// ── Polling open attempts (customer closed the tab, webhook delayed or lost) ───────────────────
export async function pollOpenAttempts(db: Db, resolver: AdapterResolver, limit = 50): Promise<{ checked: number; settled: number; expired: number }> {
  const cutoff = new Date(Date.now() - 2 * 60_000).toISOString()
  const { data } = await db.from('payment_attempts').select('id, provider, environment, provider_order_id, expires_at, created_at')
    .in('status', ['created', 'pending']).lt('created_at', cutoff).order('last_checked_at', { ascending: true, nullsFirst: true }).limit(limit)
  let checked = 0, settled = 0, expired = 0
  for (const a of data ?? []) {
    const adapter = resolver.get(a.provider, a.environment)
    if (!adapter) continue
    checked++
    let payments: ProviderPayment[]
    try { payments = await adapter.orderPayments(a.provider_order_id) } catch { continue }
    const captured = payments.find((p) => p.status === 'captured')
    if (captured) {
      const s = await settle(db, adapter.code, adapter.environment, a.provider_order_id, captured)
      if (s.success) settled++
      continue
    }
    const age = Date.now() - new Date(a.created_at).getTime()
    const past = a.expires_at ? new Date(a.expires_at).getTime() < Date.now() : age > 48 * 3_600_000
    if (past && !payments.some((p) => p.status === 'pending' || p.status === 'authorized')) {
      await db.rpc('payment_attempt_close', { p_attempt: a.id, p_status: 'expired' }); expired++
    } else {
      await db.from('payment_attempts').update({ last_checked_at: new Date().toISOString() }).eq('id', a.id)
    }
  }
  return { checked, settled, expired }
}

// ── Refund execution (after approval) ──────────────────────────────────────────────────────────
/** Sends an approved refund to the provider that took the payment — never to another provider. */
export async function executeRefund(db: Db, resolver: AdapterResolver, refundId: string): Promise<Result<{ status: string }>> {
  const { data: r } = await db.from('payment_refunds').select('*').eq('id', refundId).maybeSingle()
  if (!r) return fail('Refund not found.', 404)
  if (r.status !== 'approved') return fail(`Refund is ${r.status}.`, 409)
  const adapter = resolver.get(r.provider, r.environment)
  if (!adapter) return fail(`${r.provider} is not configured; the refund stays approved until it is.`, 503)
  let orderId: string | null = null
  if (r.payment_id) {
    const { data: p } = await db.from('org_subscription_payments').select('attempt_id').eq('id', r.payment_id).single()
    if (p?.attempt_id) orderId = (await db.from('payment_attempts').select('provider_order_id').eq('id', p.attempt_id).single()).data?.provider_order_id ?? null
  } else {
    orderId = (await db.from('unapplied_payments').select('provider_order_id').eq('id', r.unapplied_id).single()).data?.provider_order_id ?? null
  }
  let out
  try {
    out = await adapter.refund({ orderId: orderId ?? '', paymentId: r.provider_payment_id, amountPaise: Number(r.amount_cents), reference: r.idempotency_key, note: r.reason })
  } catch (e) {
    console.error('[payments] refund failed at provider:', (e as Error).message)
    return fail('The provider did not accept the refund. It stays approved; try again or check the provider dashboard.', 502)
  }
  const { error } = await db.rpc('payment_refund_submitted', { p_refund: r.id, p_provider_refund_id: out.refundId })
  if (error) return fail(friendly(error.message), 409)
  if (out.status !== 'pending') {
    await db.rpc('payment_refund_result', { p_provider: r.provider, p_env: r.environment, p_provider_refund_id: out.refundId, p_idempotency_key: null, p_status: out.status, p_failure: null })
  }
  return { success: true, data: { status: out.status === 'pending' ? 'submitted' : out.status } }
}

// ── Reconciliation (payment → settlement) ──────────────────────────────────────────────────────
export async function reconcile(db: Db, adapter: ProviderAdapter, from: Date, to: Date, startedBy: string | null = null): Promise<Result<{ runId: string; matched: number; exceptions: number }>> {
  const { data: run, error } = await db.from('payment_reconciliation_runs').insert({ provider: adapter.code, environment: adapter.environment, period_from: from.toISOString(), period_to: to.toISOString(), started_by: startedBy }).select('id').single()
  if (error) return fail(error.message, 500)
  try {
    const lines = await adapter.settlements(from, to)
    let matched = 0, exceptions = 0
    const items: Record<string, unknown>[] = []
    const seen = new Set<string>()
    // One row per provider settlement: net amount (payments − refunds), fees and tax on fees.
    const bySettlement = new Map<string, { utr: string | null; settledAt: string | null; amount: number; fees: number; tax: number }>()
    for (const l of lines) {
      const t = bySettlement.get(l.settlementId) ?? { utr: l.utr, settledAt: l.settledAt, amount: 0, fees: 0, tax: 0 }
      t.amount += l.kind === 'refund' ? -l.amountPaise : l.amountPaise
      t.fees += l.feePaise; t.tax += l.taxOnFeePaise
      bySettlement.set(l.settlementId, t)
    }
    const settlementIds = new Map<string, string>()
    for (const [sid, t] of bySettlement) {
      const { data: row } = await db.from('payment_settlements').upsert({
        provider: adapter.code, environment: adapter.environment, provider_settlement_id: sid, utr: t.utr, settled_at: t.settledAt,
        amount_cents: t.amount, fees_cents: t.fees, tax_on_fees_cents: t.tax,
      }, { onConflict: 'provider,environment,provider_settlement_id' }).select('id').single()
      if (row) settlementIds.set(sid, row.id)
    }
    for (const l of lines) {
      const s = { id: settlementIds.get(l.settlementId) ?? null }
      if (l.kind !== 'payment' || !l.paymentId) continue
      seen.add(l.paymentId)
      const { data: p } = await db.from('org_subscription_payments').select('id, amount_cents').eq('provider', adapter.code).eq('environment', adapter.environment).eq('provider_payment_id', l.paymentId).maybeSingle()
      if (!p) {
        const { data: u } = await db.from('unapplied_payments').select('id').eq('provider', adapter.code).eq('environment', adapter.environment).eq('provider_payment_id', l.paymentId).maybeSingle()
        if (u) { matched++; items.push({ run_id: run.id, kind: 'matched', provider_payment_id: l.paymentId, settlement_id: s?.id, actual_cents: l.amountPaise }); continue }
        exceptions++; items.push({ run_id: run.id, kind: 'missing_in_regrow', provider_payment_id: l.paymentId, settlement_id: s?.id, actual_cents: l.amountPaise })
        continue
      }
      if (Number(p.amount_cents) !== l.amountPaise) {
        exceptions++; items.push({ run_id: run.id, kind: 'amount_mismatch', provider_payment_id: l.paymentId, payment_id: p.id, settlement_id: s?.id, expected_cents: p.amount_cents, actual_cents: l.amountPaise })
      } else {
        matched++; items.push({ run_id: run.id, kind: 'matched', provider_payment_id: l.paymentId, payment_id: p.id, settlement_id: s?.id, expected_cents: p.amount_cents, actual_cents: l.amountPaise })
      }
      await db.from('org_subscription_payments').update({ settlement_id: s?.id, settled_at: l.settledAt, fee_cents: l.feePaise, tax_on_fee_cents: l.taxOnFeePaise }).eq('id', p.id)
    }
    // Captured in REGrow more than 5 days before the period end but not in any settlement yet.
    const { data: unsettled } = await db.from('org_subscription_payments').select('id, provider_payment_id, amount_cents')
      .eq('provider', adapter.code).eq('environment', adapter.environment).is('settlement_id', null).lt('verified_at', new Date(to.getTime() - 5 * 86_400_000).toISOString())
    for (const u of unsettled ?? []) {
      if (seen.has(u.provider_payment_id)) continue
      exceptions++; items.push({ run_id: run.id, kind: 'unsettled_overdue', provider_payment_id: u.provider_payment_id, payment_id: u.id, expected_cents: u.amount_cents })
    }
    if (items.length) await db.from('payment_reconciliation_items').insert(items)
    await db.from('payment_reconciliation_runs').update({ status: 'completed', matched, exceptions, finished_at: new Date().toISOString() }).eq('id', run.id)
    return { success: true, data: { runId: run.id, matched, exceptions } }
  } catch (e) {
    await db.from('payment_reconciliation_runs').update({ status: 'failed', error: (e as Error).message.slice(0, 300), finished_at: new Date().toISOString() }).eq('id', run.id)
    return fail('Reconciliation failed: ' + (e as Error).message, 502)
  }
}

// ── Health ─────────────────────────────────────────────────────────────────────────────────────
export async function checkHealth(db: Db, resolver: AdapterResolver): Promise<{ provider: ProviderCode; ok: boolean; latencyMs: number; error: string | null }[]> {
  const out = []
  for (const a of await operableAdapters(db, resolver)) {
    const t = Date.now()
    let ok = true, error: string | null = null
    try { await a.healthCheck() } catch (e) { ok = false; error = (e as Error).message }
    const latencyMs = Date.now() - t
    await db.rpc('payment_health_record', { p_provider: a.code, p_env: a.environment, p_ok: ok, p_latency: latencyMs, p_error: error })
    out.push({ provider: a.code, ok, latencyMs, error })
  }
  return out
}
