// tests/fixtures/cashfree.mjs — Cashfree request/response shapes used by the tests, written from Cashfree's published
// PG API reference (version 2023-08-01) and Subscriptions API. They stand in for the sandbox until sandbox
// credentials exist; replace them with recorded sandbox responses during the validation gate
// (docs/operations/PAYMENTS_RUNBOOK.md). A fake Cashfree server built on them is used by the real-database tests.
import crypto from 'node:crypto'

export const CF_SECRET = 'cf_test_secret_for_tests_only'

export function signCashfree(body, ts = String(Math.floor(Date.now() / 1000)), secret = CF_SECRET) {
  return { 'x-webhook-timestamp': ts, 'x-webhook-signature': crypto.createHmac('sha256', secret).update(ts + body).digest('base64') }
}

export const paymentWebhook = (orderId, cfPaymentId, amountRupees, status = 'SUCCESS', type = 'PAYMENT_SUCCESS_WEBHOOK') => JSON.stringify({
  data: {
    order: { order_id: orderId, order_amount: amountRupees, order_currency: 'INR', order_tags: null },
    payment: { cf_payment_id: cfPaymentId, payment_status: status, payment_amount: amountRupees, payment_currency: 'INR', payment_message: 'Simulated', payment_time: '2026-11-19T10:00:00+05:30', bank_reference: '1234', payment_group: 'upi' },
    customer_details: { customer_name: null, customer_id: 'c1', customer_email: 'x@example.test', customer_phone: '9000000000' },
  },
  event_time: '2026-11-19T10:00:01+05:30',
  type,
})

export const refundWebhook = (refundRef, cfRefundId, cfPaymentId, amountRupees, status = 'SUCCESS') => JSON.stringify({
  data: { refund: { cf_refund_id: cfRefundId, cf_payment_id: cfPaymentId, refund_id: refundRef, order_id: 'o', refund_amount: amountRupees, refund_currency: 'INR', refund_status: status, status_description: status === 'SUCCESS' ? 'Refund processed' : 'Refund failed' } },
  event_time: '2026-11-19T10:00:00+05:30', type: 'REFUND_STATUS_WEBHOOK',
})

export const disputeWebhook = (disputeId, cfPaymentId, amountRupees, status, type = 'DISPUTE_UPDATED') => JSON.stringify({
  data: { dispute: { dispute_id: disputeId, dispute_type: 'CHARGEBACK', reason_description: 'Customer claim', dispute_amount: amountRupees, dispute_status: status, respond_by: '2026-11-30T00:00:00+05:30' }, order_details: { order_id: 'o', cf_payment_id: cfPaymentId } },
  event_time: '2026-11-19T10:00:00+05:30', type,
})

export const subscriptionWebhook = (subscriptionId, status) => JSON.stringify({
  data: { subscription_details: { subscription_id: subscriptionId, subscription_status: status } },
  event_time: '2026-11-19T10:00:00+05:30', type: 'SUBSCRIPTION_STATUS_CHANGED',
})

export const subscriptionPaymentWebhook = (subscriptionId, paymentId, cfPaymentId, amountRupees, ok = true) => JSON.stringify({
  data: {
    subscription_details: { subscription_id: subscriptionId, subscription_status: 'ACTIVE' },
    payment_details: { payment_id: paymentId, cf_payment_id: cfPaymentId, payment_status: ok ? 'SUCCESS' : 'FAILED', payment_amount: amountRupees, failure_details: ok ? null : { failure_reason: 'Insufficient balance' } },
  },
  event_time: '2026-11-19T10:00:00+05:30', type: ok ? 'SUBSCRIPTION_PAYMENT_SUCCESS' : 'SUBSCRIPTION_PAYMENT_FAILED',
})

/**
 * A fake Cashfree PG server (fetch implementation). State is inspectable and mutable by the test:
 *   orders: order_id → { amount, payments: [{ cf_payment_id, payment_status, payment_amount }] }
 *   down: true → every call fails with a network error (provider outage)
 */
export function fakeCashfree() {
  const state = { orders: new Map(), refunds: [], subscriptions: new Map(), charges: [], settlements: [], calls: [], down: false }
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  async function fetchImpl(url, init = {}) {
    const u = new URL(url)
    const path = u.pathname.replace(/^\/pg/, '')
    const headers = init.headers ?? {}
    state.calls.push({ method: init.method ?? 'GET', path, headers, body: init.body ? JSON.parse(init.body) : null })
    if (state.down) throw new TypeError('fetch failed (simulated outage)')
    if (headers['x-client-id'] !== 'cf_app' || headers['x-client-secret'] !== CF_SECRET) return json({ message: 'authentication Failed', code: 'request_failed', type: 'authentication_error' }, 401)
    if (!headers['x-api-version']) return json({ message: 'x-api-version missing' }, 400)
    const body = init.body ? JSON.parse(init.body) : null
    let m
    if (init.method === 'POST' && path === '/orders') {
      if (state.orders.has(body.order_id)) return json({ message: 'order with same id is already present', code: 'order_already_exists' }, 409)
      state.orders.set(body.order_id, { amount: body.order_amount, payments: [] })
      return json({ cf_order_id: String(state.orders.size), order_id: body.order_id, order_amount: body.order_amount, order_currency: body.order_currency, order_status: 'ACTIVE', payment_session_id: `session_${body.order_id}`, order_expiry_time: new Date(Date.now() + 30 * 86_400_000).toISOString() })
    }
    if ((m = path.match(/^\/orders\/([^/]+)\/payments$/))) {
      const o = state.orders.get(decodeURIComponent(m[1]))
      return o ? json(o.payments.map((p) => ({ order_id: decodeURIComponent(m[1]), payment_currency: 'INR', payment_group: 'upi', ...p }))) : json({ message: 'order not found' }, 404)
    }
    if ((m = path.match(/^\/orders\/([^/]+)\/refunds$/)) && init.method === 'POST') {
      const r = { cf_refund_id: `cfr_${state.refunds.length + 1}`, refund_id: body.refund_id, refund_amount: body.refund_amount, refund_status: 'PENDING', order_id: decodeURIComponent(m[1]) }
      state.refunds.push(r)
      return json(r)
    }
    if (path.match(/^\/orders\/[^/]+$/)) return json({ message: 'order not found', code: 'order_not_found' }, 404)
    if (path === '/settlement/recon' && init.method === 'POST') return json({ cursor: null, limit: 1000, data: state.settlements })
    if (path === '/subscriptions' && init.method === 'POST') {
      state.subscriptions.set(body.subscription_id, { status: 'INITIALIZED', body })
      return json({ subscription_id: body.subscription_id, cf_subscription_id: 'cfs_1', subscription_status: 'INITIALIZED', authorization_details: { authorization_link: `https://sandbox.cashfree.example/authorise/${body.subscription_id}` } })
    }
    if ((m = path.match(/^\/subscriptions\/([^/]+)\/manage$/))) { const s = state.subscriptions.get(decodeURIComponent(m[1])); if (s) s.status = 'CANCELLED'; return json({ subscription_status: 'CANCELLED' }) }
    if (path === '/subscriptions/pay') { state.charges.push(body); return json({ cf_payment_id: `cfsp_${state.charges.length}`, payment_id: body.payment_id, payment_status: 'INITIALIZED' }) }
    return json({ message: `not handled ${init.method} ${path}` }, 404)
  }
  return { state, fetchImpl }
}
