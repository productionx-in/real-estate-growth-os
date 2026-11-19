// lib/payments/cashfree/adapter.ts — Cashfree Payments behind the provider contract (PG API version 2023-08-01;
// Subscriptions API for UPI AutoPay). Written from Cashfree's published API reference. Request and response shapes
// must be confirmed against the sandbox before go-live (docs/operations/PAYMENTS_RUNBOOK.md, validation gate).
//
// Security: the app id and secret key are server-only environment variables; the browser receives only the
// payment_session_id and the mode. Webhooks: signature = base64(HMAC-SHA256(timestamp + raw body, secret key)) in
// x-webhook-signature, with x-webhook-timestamp; deliveries older than 10 minutes are refused (replay protection).
import crypto from 'node:crypto'
import {
  ProviderError, toPaise, toRupees, type DisputeStatus, type MandateAdapter, type MandateStatus, type NeutralEvent, type ParsedWebhook,
  type ProviderAdapter, type ProviderPayment, type ProviderPaymentStatus, type SettlementLine,
} from '../types'

export interface CashfreeConfig {
  appId: string
  secretKey: string
  mode: 'sandbox' | 'production'
}

const API_VERSION = '2023-08-01'
const SUBSCRIPTIONS_API_VERSION = '2025-01-01'
const REPLAY_WINDOW_MS = 10 * 60_000

export function cashfreeConfig(env: Record<string, string | undefined> = process.env): CashfreeConfig | null {
  const appId = env.CASHFREE_APP_ID?.trim()
  const secretKey = env.CASHFREE_SECRET_KEY?.trim()
  const mode = env.CASHFREE_ENVIRONMENT?.trim()
  if (!appId || !secretKey || (mode !== 'sandbox' && mode !== 'production')) return null
  return { appId, secretKey, mode }
}

const PAYMENT_STATUS: Record<string, ProviderPaymentStatus> = {
  SUCCESS: 'captured', PENDING: 'pending', NOT_ATTEMPTED: 'pending', FLAGGED: 'pending',
  FAILED: 'failed', USER_DROPPED: 'failed', VOID: 'failed', CANCELLED: 'failed',
}
const DISPUTE_STATUS: Record<string, DisputeStatus> = {
  DISPUTE_CREATED: 'open', DISPUTE_DOCS_RECEIVED: 'under_review', DISPUTE_UNDER_REVIEW: 'under_review',
  DISPUTE_MERCHANT_WON: 'won', DISPUTE_MERCHANT_LOST: 'lost', DISPUTE_MERCHANT_ACCEPTED: 'lost', DISPUTE_INSUFFICIENT_EVIDENCE: 'lost', DISPUTE_CLOSED: 'closed',
}
const MANDATE_STATUS: Record<string, MandateStatus> = {
  INITIALIZED: 'pending_authorisation', BANK_APPROVAL_PENDING: 'pending_authorisation', ACTIVE: 'active', ON_HOLD: 'paused',
  PAUSED: 'paused', CUSTOMER_PAUSED: 'paused', CANCELLED: 'cancelled', CUSTOMER_CANCELLED: 'cancelled', EXPIRED: 'expired',
  COMPLETED: 'expired', LINK_EXPIRED: 'expired', FAILED: 'failed',
}

interface CfPayment { cf_payment_id: string | number; order_id?: string; payment_amount: number; payment_currency?: string; payment_status: string; payment_group?: string }

const toPayment = (p: CfPayment, orderId?: string | null): ProviderPayment => ({
  paymentId: String(p.cf_payment_id), orderId: p.order_id ?? orderId ?? null, amountPaise: toPaise(p.payment_amount),
  currency: p.payment_currency ?? 'INR', status: PAYMENT_STATUS[p.payment_status] ?? 'pending', method: p.payment_group ?? null,
})

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

export function cashfreeWebhookSignature(timestamp: string, rawBody: string, secretKey: string): string {
  return crypto.createHmac('sha256', secretKey).update(timestamp + rawBody, 'utf8').digest('base64')
}

export function cashfreeAdapter(cfg: CashfreeConfig, fetchImpl: typeof fetch = fetch, now: () => number = Date.now): ProviderAdapter {
  const base = cfg.mode === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg'
  async function call<T>(path: string, init: RequestInit & { idempotencyKey?: string; apiVersion?: string } = { method: 'GET' }): Promise<T> {
    let res: Response
    try {
      res = await fetchImpl(`${base}${path}`, {
        method: init.method, body: init.body,
        headers: {
          'x-client-id': cfg.appId, 'x-client-secret': cfg.secretKey, 'x-api-version': init.apiVersion ?? API_VERSION,
          'Content-Type': 'application/json', Accept: 'application/json',
          ...(init.idempotencyKey ? { 'x-idempotency-key': init.idempotencyKey } : {}),
        },
        signal: AbortSignal.timeout(15_000),
      })
    } catch (e) { throw new ProviderError(`Cashfree ${path}: ${(e as Error).message}`) }
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      const reason = (body as { message?: string }).message ?? `HTTP ${res.status}`
      throw new ProviderError(`Cashfree ${path}: ${reason}`, res.status, res.status >= 500 || res.status === 429)
    }
    return body as T
  }
  const ref = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 45)

  const mandates: MandateAdapter = {
    async createMandate(input) {
      const r = await call<{ subscription_id: string; subscription_status: string; subscription_session_id?: string; authorization_details?: { authorization_link?: string } }>('/subscriptions', {
        method: 'POST', apiVersion: SUBSCRIPTIONS_API_VERSION, idempotencyKey: input.reference,
        body: JSON.stringify({
          subscription_id: ref(input.reference),
          customer_details: { customer_id: ref(input.customer.id), customer_email: input.customer.email ?? undefined, customer_phone: input.customer.phone ?? undefined, customer_name: input.customer.name ?? undefined },
          plan_details: { plan_name: `REGrow ${input.frequency}`, plan_type: 'ON_DEMAND', plan_currency: 'INR', plan_max_amount: toRupees(input.maxAmountPaise) },
          authorization_details: { authorization_amount: 1, authorization_amount_refund: true, payment_methods: input.method === 'upi_autopay' ? ['upi'] : input.method === 'enach' ? ['enach'] : ['card'] },
          subscription_meta: input.returnUrl ? { return_url: input.returnUrl } : undefined,
          subscription_tags: { org_id: input.orgId },
        }),
      })
      return {
        mandateId: r.subscription_id, status: MANDATE_STATUS[r.subscription_status] ?? 'pending_authorisation',
        authorisationUrl: r.authorization_details?.authorization_link ?? null,
      }
    },
    async fetchMandate(mandateId) {
      const r = await call<{ subscription_status: string }>(`/subscriptions/${encodeURIComponent(mandateId)}`, { method: 'GET', apiVersion: SUBSCRIPTIONS_API_VERSION })
      return { status: MANDATE_STATUS[r.subscription_status] ?? 'pending_authorisation' }
    },
    async cancelMandate(mandateId) {
      await call(`/subscriptions/${encodeURIComponent(mandateId)}/manage`, { method: 'POST', apiVersion: SUBSCRIPTIONS_API_VERSION, body: JSON.stringify({ subscription_id: mandateId, action: 'CANCEL' }) })
    },
    async chargeMandate({ mandateId, chargeReference, amountPaise, scheduleAt, note }) {
      const r = await call<{ cf_payment_id: string | number; payment_id?: string }>('/subscriptions/pay', {
        method: 'POST', apiVersion: SUBSCRIPTIONS_API_VERSION, idempotencyKey: chargeReference,
        body: JSON.stringify({ subscription_id: mandateId, payment_id: ref(chargeReference), payment_amount: toRupees(amountPaise), payment_schedule_date: scheduleAt, payment_remarks: note.slice(0, 100), payment_type: 'CHARGE' }),
      })
      return { chargeId: String(r.payment_id ?? r.cf_payment_id) }
    },
  }

  return {
    code: 'cashfree',
    environment: cfg.mode === 'production' ? 'live' : 'test',
    publicCheckout: () => ({ provider: 'cashfree', mode: cfg.mode }),

    async createOrder(input) {
      // Cashfree requires the payer's mobile number; never invent one.
      if (!input.customer.phone || !/^\+?\d{10,13}$/.test(input.customer.phone.replace(/[\s-]/g, ''))) {
        throw new ProviderError('A mobile number is needed on your profile to pay online.', null, false)
      }
      const o = await call<{ order_id: string; payment_session_id: string; order_amount: number; order_expiry_time?: string }>('/orders', {
        method: 'POST', idempotencyKey: input.reference,
        body: JSON.stringify({
          order_id: ref(input.reference), order_amount: toRupees(input.amountPaise), order_currency: input.currency,
          customer_details: {
            customer_id: ref(input.customer.id), customer_email: input.customer.email ?? undefined,
            customer_phone: input.customer.phone.replace(/[\s-]/g, '').replace(/^\+91/, ''), customer_name: input.customer.name ?? undefined,
          },
          order_meta: { return_url: input.returnUrl ?? undefined, notify_url: input.notifyUrl ?? undefined },
          order_note: `Invoice ${input.invoiceNumber}`,
          order_tags: { invoice_id: input.invoiceId, org_id: input.orgId },
        }),
      })
      if (toPaise(o.order_amount) !== input.amountPaise) throw new ProviderError('Cashfree order amount differs from the invoice', null, false)
      return { orderId: o.order_id, checkoutSession: o.payment_session_id, expiresAt: o.order_expiry_time ?? null }
    },

    async orderPayments(orderId) {
      const r = await call<CfPayment[]>(`/orders/${encodeURIComponent(orderId)}/payments`)
      return (Array.isArray(r) ? r : []).map((p) => toPayment(p, orderId))
    },

    // Cashfree's return carries only the order id; the server then reads the payments from Cashfree itself.
    verifyReturn(params) {
      const orderId = String(params.orderId ?? params.order_id ?? '')
      return /^[A-Za-z0-9_-]{3,50}$/.test(orderId) ? { orderId, paymentId: null } : null
    },

    verifyWebhook(rawBody, headers) {
      const signature = headers.get('x-webhook-signature'), timestamp = headers.get('x-webhook-timestamp')
      if (!signature || !timestamp || !/^\d{10,13}$/.test(timestamp)) return false
      const ts = timestamp.length === 13 ? Number(timestamp) : Number(timestamp) * 1000
      if (Math.abs(now() - ts) > REPLAY_WINDOW_MS) return false
      return safeEqual(cashfreeWebhookSignature(timestamp, rawBody, cfg.secretKey), signature)
    },

    parseWebhook(rawBody, headers): ParsedWebhook {
      const e = JSON.parse(rawBody) as {
        type?: string; event_time?: string
        data?: {
          order?: { order_id: string }; payment?: CfPayment; refund?: { cf_refund_id?: string | number; refund_id?: string; cf_payment_id?: string | number; refund_amount: number; refund_status: string; status_description?: string }
          dispute?: { dispute_id: string | number; dispute_status: string; dispute_amount: number; reason_description?: string; respond_by?: string }
          order_details?: { order_id?: string; cf_payment_id?: string | number }
          subscription_details?: { subscription_id: string; subscription_status: string }
          payment_details?: { payment_id?: string; cf_payment_id?: string | number; payment_status?: string; payment_amount?: number; failure_details?: { failure_reason?: string } }
        }
      }
      const type = String(e.type ?? 'unknown')
      const d = e.data ?? {}
      let event: NeutralEvent = { kind: 'ignored', reason: `event ${type} is not used` }
      let identity = type
      if (type.startsWith('PAYMENT_') && d.payment) {
        const payment = toPayment(d.payment, d.order?.order_id)
        identity += `:${payment.paymentId}:${d.payment.payment_status}`
        if (type === 'PAYMENT_SUCCESS_WEBHOOK' && payment.status === 'captured') event = { kind: 'payment.captured', payment }
        else if (type === 'PAYMENT_FAILED_WEBHOOK' || type === 'PAYMENT_USER_DROPPED_WEBHOOK') event = { kind: 'payment.failed', payment: { ...payment, status: 'failed' } }
      } else if (type === 'REFUND_STATUS_WEBHOOK' && d.refund) {
        const r = d.refund
        const status = r.refund_status === 'SUCCESS' ? 'processed' : r.refund_status === 'CANCELLED' || r.refund_status === 'FAILED' ? 'failed' : 'pending'
        identity += `:${r.cf_refund_id ?? r.refund_id}:${r.refund_status}`
        event = { kind: 'refund.updated', refund: { refundId: r.cf_refund_id != null ? String(r.cf_refund_id) : null, reference: r.refund_id ?? null, paymentId: r.cf_payment_id != null ? String(r.cf_payment_id) : null, amountPaise: toPaise(r.refund_amount), status, reason: r.status_description ?? null } }
      } else if (type.startsWith('DISPUTE_') && d.dispute) {
        const x = d.dispute
        identity += `:${x.dispute_id}:${x.dispute_status}`
        event = { kind: 'dispute.updated', dispute: { disputeId: String(x.dispute_id), paymentId: String(d.order_details?.cf_payment_id ?? ''), amountPaise: toPaise(x.dispute_amount), status: DISPUTE_STATUS[x.dispute_status] ?? 'open', reason: x.reason_description ?? null, respondBy: x.respond_by ?? null } }
      } else if (type === 'SUBSCRIPTION_STATUS_CHANGED' && d.subscription_details) {
        const s = d.subscription_details
        identity += `:${s.subscription_id}:${s.subscription_status}`
        event = { kind: 'mandate.updated', mandate: { mandateId: s.subscription_id, status: MANDATE_STATUS[s.subscription_status] ?? 'pending_authorisation', detail: s.subscription_status } }
      } else if ((type === 'SUBSCRIPTION_PAYMENT_SUCCESS' || type === 'SUBSCRIPTION_PAYMENT_FAILED') && d.payment_details && d.subscription_details) {
        const p = d.payment_details
        const ok = type === 'SUBSCRIPTION_PAYMENT_SUCCESS'
        identity += `:${p.payment_id}:${type}`
        event = {
          kind: 'mandate.charge', charge: {
            chargeId: String(p.payment_id ?? ''), mandateId: d.subscription_details.subscription_id, succeeded: ok,
            payment: ok && p.cf_payment_id != null && p.payment_amount != null ? { paymentId: String(p.cf_payment_id), orderId: null, amountPaise: toPaise(p.payment_amount), currency: 'INR', status: 'captured', method: 'upi_autopay' } : null,
            failure: ok ? null : p.failure_details?.failure_reason ?? 'debit failed',
          },
        }
      }
      // Cashfree does not document a per-delivery event id for every event type: identify the event by what it is
      // (type + entity + status), so the same event delivered twice is recognised as a duplicate.
      const eventId = headers.get('x-idempotency-key') ?? crypto.createHash('sha256').update(identity).digest('hex')
      return { eventId, type, event }
    },

    async refund({ orderId, amountPaise, reference, note }) {
      const r = await call<{ cf_refund_id: string | number; refund_status: string }>(`/orders/${encodeURIComponent(orderId)}/refunds`, {
        method: 'POST', idempotencyKey: reference,
        body: JSON.stringify({ refund_amount: toRupees(amountPaise), refund_id: ref(reference), refund_note: note.slice(0, 100) }),
      })
      return { refundId: String(r.cf_refund_id), status: r.refund_status === 'SUCCESS' ? 'processed' : r.refund_status === 'CANCELLED' ? 'failed' : 'pending' }
    },

    async settlements(from, to) {
      const r = await call<{ data?: { cf_payment_id?: string | number; event_type: string; event_amount: number; settlement_utr?: string; cf_settlement_id?: string | number; settlement_date?: string; service_charge?: number; service_tax?: number }[] }>('/settlement/recon', {
        method: 'POST', body: JSON.stringify({ pagination: { limit: 1000 }, filters: { start_date: from.toISOString(), end_date: to.toISOString() } }),
      })
      return (r.data ?? []).filter((x) => x.cf_settlement_id != null).map((x): SettlementLine => ({
        settlementId: String(x.cf_settlement_id), utr: x.settlement_utr ?? null, settledAt: x.settlement_date ?? null,
        kind: x.event_type === 'PAYMENT' ? 'payment' : x.event_type === 'REFUND' ? 'refund' : 'adjustment',
        paymentId: x.cf_payment_id != null ? String(x.cf_payment_id) : null,
        amountPaise: toPaise(Math.abs(x.event_amount)), feePaise: toPaise(x.service_charge ?? 0), taxOnFeePaise: toPaise(x.service_tax ?? 0),
      }))
    },

    async refundStatus({ orderId, reference }) {
      if (!orderId) throw new ProviderError('order id required for a Cashfree refund', null, false)
      const r = await call<{ refund_status: string }>(`/orders/${encodeURIComponent(orderId)}/refunds/${encodeURIComponent(ref(reference))}`)
      return r.refund_status === 'SUCCESS' ? 'processed' : r.refund_status === 'CANCELLED' || r.refund_status === 'FAILED' ? 'failed' : 'pending'
    },

    // An authenticated read of an order that cannot exist: 404 proves the API is up and our credentials work.
    async healthCheck() {
      try { await call('/orders/regrow_health_probe') } catch (e) {
        if (e instanceof ProviderError && e.httpStatus === 404) return
        throw e
      }
    },

    mandates,
  }
}
