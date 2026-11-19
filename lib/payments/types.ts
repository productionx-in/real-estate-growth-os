// lib/payments/types.ts — the provider-independent payment contract. Nothing above lib/payments/<provider>/ uses a
// provider's field names. Amounts are always integer paise. A provider only moves money and reports what happened;
// prices, invoices, GST, contracts and entitlements belong to REGrow (lib/dal/billing.ts and the database).

export type ProviderCode = 'razorpay' | 'cashfree'
export type PaymentEnvironment = 'test' | 'live'

export interface OrderInput {
  /** Our identifier for this attempt; used as the provider order reference and idempotency key where supported. */
  reference: string
  invoiceId: string
  invoiceNumber: string
  orgId: string
  amountPaise: number
  currency: string
  customer: { id: string; email?: string | null; phone?: string | null; name?: string | null }
  returnUrl?: string | null
  notifyUrl?: string | null
}

export interface ProviderOrder {
  orderId: string
  /** What the browser needs to open checkout (never a secret). */
  checkoutSession?: string | null
  expiresAt?: string | null
}

export type ProviderPaymentStatus = 'captured' | 'authorized' | 'pending' | 'failed'

export interface ProviderPayment {
  paymentId: string
  orderId: string | null
  amountPaise: number
  currency: string
  status: ProviderPaymentStatus
  method?: string | null
}

export type RefundStatus = 'pending' | 'processed' | 'failed'
export type DisputeStatus = 'open' | 'under_review' | 'won' | 'lost' | 'closed'
export type MandateStatus = 'pending_authorisation' | 'active' | 'paused' | 'cancelled' | 'failed' | 'expired'

export type NeutralEvent =
  | { kind: 'payment.captured'; payment: ProviderPayment }
  | { kind: 'payment.failed'; payment: ProviderPayment }
  | { kind: 'refund.updated'; refund: { refundId: string | null; reference: string | null; paymentId: string | null; amountPaise: number; status: RefundStatus; reason?: string | null } }
  | { kind: 'dispute.updated'; dispute: { disputeId: string; paymentId: string; amountPaise: number; status: DisputeStatus; reason: string | null; respondBy: string | null } }
  | { kind: 'mandate.updated'; mandate: { mandateId: string; status: MandateStatus; detail: string | null } }
  | { kind: 'mandate.charge'; charge: { chargeId: string; mandateId: string; succeeded: boolean; payment: ProviderPayment | null; failure: string | null } }
  | { kind: 'ignored'; reason: string }

export interface ParsedWebhook {
  /** Stable per delivery content: the provider's id where it sends one, else a hash of the event's identity. */
  eventId: string
  type: string
  event: NeutralEvent
}

export interface SettlementLine {
  settlementId: string
  utr: string | null
  settledAt: string | null
  kind: 'payment' | 'refund' | 'adjustment'
  paymentId: string | null
  amountPaise: number
  feePaise: number
  taxOnFeePaise: number
}

export interface MandateInput {
  reference: string
  orgId: string
  maxAmountPaise: number
  frequency: 'monthly' | 'quarterly' | 'annual' | 'as_presented'
  method: 'upi_autopay' | 'enach' | 'card'
  customer: OrderInput['customer']
  returnUrl?: string | null
}

export interface MandateAdapter {
  createMandate(input: MandateInput): Promise<{ mandateId: string; authorisationUrl: string | null; status: MandateStatus }>
  fetchMandate(mandateId: string): Promise<{ status: MandateStatus }>
  cancelMandate(mandateId: string): Promise<void>
  /** Present a charge (the provider sends the pre-debit notification for UPI AutoPay where it is responsible). */
  chargeMandate(input: { mandateId: string; chargeReference: string; amountPaise: number; scheduleAt: string; note: string }): Promise<{ chargeId: string }>
}

export interface ProviderAdapter {
  code: ProviderCode
  environment: PaymentEnvironment
  /** Data the browser needs to open this provider's checkout. Never contains a secret. */
  publicCheckout(): { provider: ProviderCode; keyId?: string; mode?: 'sandbox' | 'production' }
  createOrder(input: OrderInput): Promise<ProviderOrder>
  /** Server-to-server: every payment made against an order. */
  orderPayments(orderId: string): Promise<ProviderPayment[]>
  /** Checks what the browser sends back after checkout. Returns the payment it claims, or null if it is not genuine. */
  verifyReturn(params: Record<string, unknown>): { orderId: string; paymentId: string | null } | null
  verifyWebhook(rawBody: string, headers: Headers): boolean
  parseWebhook(rawBody: string, headers: Headers): ParsedWebhook
  refund(input: { orderId: string; paymentId: string; amountPaise: number; reference: string; note: string }): Promise<{ refundId: string; status: RefundStatus }>
  settlements(from: Date, to: Date): Promise<SettlementLine[]>
  /** Cheap authenticated call; throws when the provider cannot be reached or rejects our credentials. */
  healthCheck(): Promise<void>
  mandates: MandateAdapter | null
}

export class ProviderError extends Error {
  constructor(message: string, readonly httpStatus: number | null = null, readonly retryable = true) { super(message) }
}

/** Rupees with two decimals → paise, without floating-point drift. */
export function toPaise(amount: number | string): number {
  const s = typeof amount === 'number' ? amount.toFixed(2) : String(amount).trim()
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new ProviderError(`invalid amount ${s}`, null, false)
  const [r, p = ''] = s.split('.')
  return Number(r) * 100 + Number((p + '00').slice(0, 2))
}

/** Paise → rupees as the decimal number providers expect (e.g. 141600 → 1416). */
export const toRupees = (paise: number) => Math.round(paise) / 100
