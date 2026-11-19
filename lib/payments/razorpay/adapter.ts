// lib/payments/razorpay/adapter.ts — Razorpay behind the provider contract. Wraps the existing, unchanged
// lib/billing/razorpay.ts (orders, checkout and webhook signatures) and adds refunds, order payments, disputes,
// settlements and health. Environment comes from the key: rzp_live_… is live, anything else test.
import crypto from 'node:crypto'
import {
  createOrder as rzCreateOrder, verifyCheckoutSignature, verifyWebhookSignature, type RazorpayConfig,
} from '@/lib/billing/razorpay'
import {
  ProviderError, type DisputeStatus, type NeutralEvent, type ParsedWebhook, type PaymentEnvironment, type ProviderAdapter,
  type ProviderPayment, type ProviderPaymentStatus, type SettlementLine,
} from '../types'

const API = 'https://api.razorpay.com/v1'

export const razorpayEnvironment = (keyId: string): PaymentEnvironment => (keyId.startsWith('rzp_live_') ? 'live' : 'test')

interface RzPayment { id: string; order_id: string | null; amount: number; currency: string; status: string; method?: string }

const mapStatus = (s: string): ProviderPaymentStatus =>
  s === 'captured' ? 'captured' : s === 'authorized' ? 'authorized' : s === 'failed' ? 'failed' : 'pending'
const toPayment = (p: RzPayment): ProviderPayment => ({
  paymentId: p.id, orderId: p.order_id, amountPaise: p.amount, currency: p.currency, status: mapStatus(p.status), method: p.method ?? null,
})
const DISPUTE: Record<string, DisputeStatus> = {
  'payment.dispute.created': 'open', 'payment.dispute.under_review': 'under_review', 'payment.dispute.action_required': 'open',
  'payment.dispute.won': 'won', 'payment.dispute.lost': 'lost', 'payment.dispute.closed': 'closed',
}

export function razorpayAdapter(cfg: RazorpayConfig, fetchImpl: typeof fetch = fetch): ProviderAdapter {
  const environment = razorpayEnvironment(cfg.keyId)
  async function call<T>(path: string, init: RequestInit = { method: 'GET' }): Promise<T> {
    let res: Response
    try {
      res = await fetchImpl(`${API}${path}`, {
        ...init,
        headers: { Authorization: `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString('base64')}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(15_000),
      })
    } catch (e) { throw new ProviderError(`Razorpay ${path}: ${(e as Error).message}`) }
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      const reason = (body as { error?: { description?: string } }).error?.description ?? `HTTP ${res.status}`
      throw new ProviderError(`Razorpay ${path}: ${reason}`, res.status, res.status >= 500 || res.status === 429)
    }
    return body as T
  }

  return {
    code: 'razorpay',
    environment,
    publicCheckout: () => ({ provider: 'razorpay', keyId: cfg.keyId }),

    async createOrder(input) {
      const o = await rzCreateOrder(cfg, {
        amountPaise: input.amountPaise, currency: input.currency, receipt: input.invoiceNumber,
        notes: { org_id: input.orgId, invoice_id: input.invoiceId, invoice_number: input.invoiceNumber, reference: input.reference },
      }, fetchImpl)
      if (o.amount !== input.amountPaise) throw new ProviderError('Razorpay order amount differs from the invoice', null, false)
      return { orderId: o.id, checkoutSession: null, expiresAt: null }
    },

    async orderPayments(orderId) {
      if (!/^order_[A-Za-z0-9]+$/.test(orderId)) throw new ProviderError('invalid order id', null, false)
      const r = await call<{ items: RzPayment[] }>(`/orders/${orderId}/payments`)
      return (r.items ?? []).map(toPayment)
    },

    verifyReturn(params) {
      const orderId = String(params.razorpay_order_id ?? params.orderId ?? '')
      const paymentId = String(params.razorpay_payment_id ?? '')
      if (!/^order_[A-Za-z0-9]+$/.test(orderId) || !/^pay_[A-Za-z0-9]+$/.test(paymentId)) return null
      return verifyCheckoutSignature(orderId, paymentId, params.razorpay_signature, cfg.keySecret) ? { orderId, paymentId } : null
    },

    verifyWebhook(rawBody, headers) {
      return !!cfg.webhookSecret && verifyWebhookSignature(rawBody, headers.get('x-razorpay-signature'), cfg.webhookSecret)
    },

    parseWebhook(rawBody, headers): ParsedWebhook {
      const e = JSON.parse(rawBody) as {
        event?: string; created_at?: number
        payload?: { payment?: { entity?: RzPayment }; refund?: { entity?: { id: string; payment_id: string; amount: number; status: string; notes?: Record<string, string> } }; dispute?: { entity?: { id: string; payment_id: string; amount: number; status: string; reason_code?: string; respond_by?: number } } }
      }
      const type = String(e.event ?? 'unknown')
      const eventId = headers.get('x-razorpay-event-id')
        ?? crypto.createHash('sha256').update(rawBody).digest('hex')
      let event: NeutralEvent = { kind: 'ignored', reason: `event ${type} is not used` }
      const p = e.payload?.payment?.entity
      if ((type === 'payment.captured' || type === 'order.paid') && p?.status === 'captured' && p.order_id) {
        event = { kind: 'payment.captured', payment: toPayment(p) }
      } else if (type === 'payment.failed' && p) {
        event = { kind: 'payment.failed', payment: toPayment(p) }
      } else if (type.startsWith('refund.') && e.payload?.refund?.entity) {
        const r = e.payload.refund.entity
        const status = r.status === 'processed' ? 'processed' : r.status === 'failed' ? 'failed' : 'pending'
        event = { kind: 'refund.updated', refund: { refundId: r.id, reference: r.notes?.reference ?? null, paymentId: r.payment_id, amountPaise: r.amount, status } }
      } else if (DISPUTE[type] && e.payload?.dispute?.entity) {
        const d = e.payload.dispute.entity
        event = { kind: 'dispute.updated', dispute: { disputeId: d.id, paymentId: d.payment_id, amountPaise: d.amount, status: DISPUTE[type], reason: d.reason_code ?? null, respondBy: d.respond_by ? new Date(d.respond_by * 1000).toISOString() : null } }
      }
      return { eventId, type, event }
    },

    async refund({ paymentId, amountPaise, reference, note }) {
      if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) throw new ProviderError('invalid payment id', null, false)
      const r = await call<{ id: string; status: string }>(`/payments/${paymentId}/refund`, {
        method: 'POST', body: JSON.stringify({ amount: amountPaise, speed: 'normal', receipt: reference.slice(0, 40), notes: { reference, note: note.slice(0, 200) } }),
      })
      return { refundId: r.id, status: r.status === 'processed' ? 'processed' : r.status === 'failed' ? 'failed' : 'pending' }
    },

    async settlements(from, to) {
      const lines: SettlementLine[] = []
      for (let d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())); d <= to; d = new Date(d.getTime() + 86_400_000)) {
        const q = `year=${d.getUTCFullYear()}&month=${d.getUTCMonth() + 1}&day=${d.getUTCDate()}&count=1000`
        const r = await call<{ items: { entity_id: string; type: string; amount: number; fee: number; tax: number; settlement_id: string; settlement_utr?: string; settled_at?: number; payment_id?: string }[] }>(`/settlements/recon/combined?${q}`)
        for (const it of r.items ?? []) {
          lines.push({
            settlementId: it.settlement_id, utr: it.settlement_utr ?? null, settledAt: it.settled_at ? new Date(it.settled_at * 1000).toISOString() : null,
            kind: it.type === 'payment' ? 'payment' : it.type === 'refund' ? 'refund' : 'adjustment',
            paymentId: it.type === 'payment' ? it.entity_id : it.payment_id ?? null, amountPaise: it.amount, feePaise: it.fee ?? 0, taxOnFeePaise: it.tax ?? 0,
          })
        }
      }
      return lines
    },

    async refundStatus({ refundId }) {
      if (!/^rfnd_[A-Za-z0-9]+$/.test(refundId)) throw new ProviderError('invalid refund id', null, false)
      const r = await call<{ status: string }>(`/refunds/${refundId}`)
      return r.status === 'processed' ? 'processed' : r.status === 'failed' ? 'failed' : 'pending'
    },

    async healthCheck() { await call('/orders?count=1') },

    // Recurring payments start on Cashfree UPI AutoPay (founder decision); Razorpay mandates are not implemented.
    mandates: null,
  }
}
