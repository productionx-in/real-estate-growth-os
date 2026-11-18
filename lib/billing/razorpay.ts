// lib/billing/razorpay.ts
// Razorpay (https://razorpay.com/docs/api/): orders for invoices, and the two signature checks that decide
// whether a payment is real. Nothing here trusts the browser: the checkout callback's signature is checked
// with the key secret, the payment is then re-read from Razorpay, and webhooks are checked with the webhook
// secret over the raw body. Without the secrets, online payment is off (callers answer 503), never open.
import crypto from 'node:crypto'

const API = 'https://api.razorpay.com/v1'

export interface RazorpayConfig {
  keyId: string
  keySecret: string
  webhookSecret: string | null
}

export function razorpayConfig(env: Record<string, string | undefined> = process.env): RazorpayConfig | null {
  const keyId = env.RAZORPAY_KEY_ID?.trim()
  const keySecret = env.RAZORPAY_KEY_SECRET?.trim()
  if (!keyId || !keySecret) return null
  return { keyId, keySecret, webhookSecret: env.RAZORPAY_WEBHOOK_SECRET?.trim() || null }
}

function safeEqualHex(expected: string, actual: unknown): boolean {
  if (typeof actual !== 'string' || !/^[0-9a-f]+$/i.test(actual)) return false
  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(actual, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/** Checkout callback: HMAC-SHA256(order_id + "|" + payment_id, key secret). */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: unknown, keySecret: string): boolean {
  if (!orderId || !paymentId) return false
  const expected = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex')
  return safeEqualHex(expected, signature)
}

/** Webhook: HMAC-SHA256(raw request body, webhook secret) in the X-Razorpay-Signature header. */
export function verifyWebhookSignature(rawBody: string, signature: unknown, webhookSecret: string): boolean {
  const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody, 'utf8').digest('hex')
  return safeEqualHex(expected, signature)
}

async function call<T>(cfg: RazorpayConfig, path: string, init: RequestInit, fetchImpl: typeof fetch): Promise<T> {
  const res = await fetchImpl(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const reason = (body as { error?: { description?: string } }).error?.description ?? `HTTP ${res.status}`
    throw new Error(`Razorpay ${path}: ${reason}`)
  }
  return body as T
}

export interface RazorpayOrder { id: string; amount: number; currency: string; status: string; receipt?: string }
export interface RazorpayPayment { id: string; order_id: string | null; amount: number; currency: string; status: string }

/** An order for one invoice. Amount is in paise, from the invoice — never from the browser. */
export function createOrder(
  cfg: RazorpayConfig, input: { amountPaise: number; currency: string; receipt: string; notes: Record<string, string> }, fetchImpl: typeof fetch = fetch
): Promise<RazorpayOrder> {
  return call<RazorpayOrder>(cfg, '/orders', {
    method: 'POST',
    body: JSON.stringify({ amount: input.amountPaise, currency: input.currency, receipt: input.receipt.slice(0, 40), notes: input.notes }),
  }, fetchImpl)
}

export function fetchPayment(cfg: RazorpayConfig, paymentId: string, fetchImpl: typeof fetch = fetch): Promise<RazorpayPayment> {
  if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) return Promise.reject(new Error('Invalid payment id'))
  return call<RazorpayPayment>(cfg, `/payments/${paymentId}`, { method: 'GET' }, fetchImpl)
}

/** The webhook events that mean money was received, and the payment inside them. */
export function capturedPaymentFromEvent(event: unknown): RazorpayPayment | null {
  const e = event as { event?: string; payload?: { payment?: { entity?: RazorpayPayment } } }
  if (e?.event !== 'payment.captured' && e?.event !== 'order.paid') return null
  const p = e.payload?.payment?.entity
  if (!p || p.status !== 'captured' || !p.order_id || typeof p.amount !== 'number') return null
  return p
}
