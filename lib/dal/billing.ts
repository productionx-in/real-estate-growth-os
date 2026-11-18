// lib/dal/billing.ts
// Self-serve billing. Callers authorise first (owner or admin of the organisation). Amounts are computed by
// the database functions from the plan catalogue (migration 20260056); this file never accepts an amount.
import { createServiceClient } from '@/lib/supabase/server'
import { createOrder, fetchPayment, type RazorpayConfig } from '@/lib/billing/razorpay'
import type { SubscriptionStatus } from '@/lib/billing/plans'
import type { DalResult } from '@/lib/dal/routing'

export interface BillingPlan {
  code: string
  name: string
  includedSeats: number
  monthlyPaise: number
  annualPaise: number
  seatPaise: number
}

export interface BillingInvoice {
  id: string
  number: string
  type: string
  status: string
  currency: string
  subtotalPaise: number | null
  taxPaise: number
  totalPaise: number
  seats: number | null
  cycle: string | null
  createdAt: string
  dueDate: string | null
  paidAt: string | null
}

export interface BillingOverview {
  subscription: {
    status: SubscriptionStatus
    planName: string
    planCode: string | null
    cycle: 'monthly' | 'annual'
    includedSeats: number
    additionalSeats: number
    periodStart: string | null
    periodEnd: string | null
    readOnly: boolean
  } | null
  seats: { used: number; reserved: number; total: number }
  /** Plan limits that apply now (max null = no limit), with current use. */
  limits: { kind: 'leads' | 'projects' | 'inventory'; label: string; used: number; max: number | null }[]
  /** Read-only because the trial or paid period ended (lifted by paying). */
  billingHold: boolean
  plans: BillingPlan[]
  invoices: BillingInvoice[]
}

export async function getBillingOverview(orgId: string): Promise<BillingOverview> {
  const db = createServiceClient()
  const [{ data: org }, { data: sub }, { count: used }, { count: reserved }, { data: invoices }] = await Promise.all([
    db.from('organisations').select('type').eq('id', orgId).single(),
    db.from('org_subscriptions').select('status, billing_cycle, included_seats, additional_seats, current_period_start, current_period_end, is_read_only, plan_version_id, plan_tier').eq('org_id', orgId).maybeSingle(),
    db.from('org_members').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'active'),
    db.from('org_invitations').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'pending').gt('expires_at', new Date().toISOString()),
    db.from('org_subscription_invoices')
      .select('id, invoice_number, invoice_type, status, currency, subtotal_cents, tax_cents, amount_cents, seat_quantity, billing_cycle, created_at, due_date, paid_at')
      .eq('org_id', orgId).neq('status', 'void').order('created_at', { ascending: false }).limit(50),
  ])

  // Plans this workspace can buy: the current, priced version of each plan for its company type.
  const { data: planRows } = await db.from('subscription_plans')
    .select('code, name, versions:subscription_plan_versions(included_seats, base_price_monthly_cents, base_price_annual_cents, additional_seat_price_cents, is_current)')
    .eq('is_active', true).eq('target_org_type', org?.type ?? 'developer')
  type PlanRow = { code: string; name: string; versions: { included_seats: number; base_price_monthly_cents: number; base_price_annual_cents: number; additional_seat_price_cents: number; is_current: boolean }[] }
  const plans: BillingPlan[] = ((planRows ?? []) as PlanRow[]).flatMap((p) => {
    const v = p.versions.find((x) => x.is_current)
    if (!v || !(v.base_price_monthly_cents > 0) || !(v.base_price_annual_cents > 0)) return []
    return [{ code: p.code, name: p.name, includedSeats: v.included_seats, monthlyPaise: Number(v.base_price_monthly_cents), annualPaise: Number(v.base_price_annual_cents), seatPaise: Number(v.additional_seat_price_cents) }]
  })

  let planName = 'Current plan'
  let planCode: string | null = null
  if (sub?.plan_version_id) {
    const { data: pv } = await db.from('subscription_plan_versions').select('plan:subscription_plans(code, name)').eq('id', sub.plan_version_id).maybeSingle()
    const plan = (pv as unknown as { plan: { code: string; name: string } | null } | null)?.plan
    if (plan) { planName = plan.name; planCode = plan.code }
  }

  type Caps = { max_leads: number | null; max_projects: number | null; max_inventory_units: number | null }
  let caps: Caps | null = null
  if (sub?.plan_version_id) {
    // max_leads (migration 20260059) is not in the generated types yet.
    const untyped = db as unknown as { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: unknown }> } } } }
    const { data: v } = await untyped.from('subscription_plan_versions').select('max_leads, max_projects, max_inventory_units').eq('id', sub.plan_version_id).maybeSingle()
    caps = v as Caps | null
  }
  const counted = async (table: 'leads' | 'projects' | 'inventory_items') =>
    (await db.from(table).select('id', { count: 'exact', head: true }).eq('org_id', orgId)).count ?? 0
  const [leadCount, projectCount, unitCount, { data: orgRow }] = await Promise.all([
    counted('leads'), counted('projects'), counted('inventory_items'),
    (db as unknown as { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: unknown }> } } } })
      .from('organisations').select('billing_hold').eq('id', orgId).maybeSingle(),
  ])
  const limits: BillingOverview['limits'] = [
    { kind: 'leads', label: 'Leads', used: leadCount, max: caps?.max_leads ?? null },
    { kind: 'projects', label: 'Projects', used: projectCount, max: caps?.max_projects ?? null },
    { kind: 'inventory', label: 'Inventory units', used: unitCount, max: caps?.max_inventory_units ?? null },
  ]

  const included = sub?.included_seats ?? 0
  const additional = sub?.additional_seats ?? 0
  return {
    subscription: sub ? {
      status: sub.status as SubscriptionStatus, planName, planCode, cycle: sub.billing_cycle as 'monthly' | 'annual',
      includedSeats: included, additionalSeats: additional,
      periodStart: sub.current_period_start, periodEnd: sub.current_period_end, readOnly: !!sub.is_read_only,
    } : null,
    seats: { used: used ?? 0, reserved: reserved ?? 0, total: included + additional },
    limits,
    billingHold: !!(orgRow as { billing_hold?: boolean } | null)?.billing_hold,
    plans,
    invoices: (invoices ?? []).map((i) => ({
      id: i.id, number: i.invoice_number, type: i.invoice_type, status: i.status, currency: i.currency,
      subtotalPaise: i.subtotal_cents == null ? null : Number(i.subtotal_cents), taxPaise: Number(i.tax_cents ?? 0), totalPaise: Number(i.amount_cents),
      seats: i.seat_quantity, cycle: i.billing_cycle, createdAt: i.created_at, dueDate: i.due_date, paidAt: i.paid_at,
    })),
  }
}

export type BillingAction =
  | { action: 'trial'; plan: string }
  | { action: 'plan'; plan: string; cycle: 'monthly' | 'annual' }
  | { action: 'seats'; seats: number }
  | { action: 'renewal' }

/** Database messages that are safe to show (they start with "billing: "); anything else is generic. */
function friendly(message: string | undefined): string {
  const m = message?.match(/billing: (.+)$/)
  if (!m) return 'Could not complete that. Please try again.'
  const s = m[1]
  return s.charAt(0).toUpperCase() + s.slice(1) + '.'
}

export async function runBillingAction(orgId: string, actorProfileId: string, a: BillingAction): Promise<DalResult<{ id: string }>> {
  const db = createServiceClient()
  const call = a.action === 'trial'
    ? db.rpc('billing_start_trial', { p_org: orgId, p_plan_code: a.plan, p_actor_profile: actorProfileId })
    : a.action === 'plan'
    ? db.rpc('billing_issue_plan_invoice', { p_org: orgId, p_plan_code: a.plan, p_cycle: a.cycle, p_actor_profile: actorProfileId })
    : a.action === 'seats'
    ? db.rpc('billing_issue_seat_invoice', { p_org: orgId, p_seats: a.seats, p_actor_profile: actorProfileId })
    : db.rpc('billing_issue_renewal_invoice', { p_org: orgId, p_actor_profile: actorProfileId })
  const { data, error } = await call
  if (error) return { success: false, error: friendly(error.message), status: /already|opens|only|no such|no seat|no price|between/.test(error.message) ? 409 : 500 }
  return { success: true, data: { id: data as string } }
}

/** A Razorpay order for an unpaid invoice of this organisation (reused if one was already created). */
export async function checkoutForInvoice(
  cfg: RazorpayConfig, orgId: string, invoiceId: string, authUserId: string, fetchImpl: typeof fetch = fetch
): Promise<DalResult<{ orderId: string; amountPaise: number; currency: string; invoiceNumber: string }>> {
  const db = createServiceClient()
  const { data: inv } = await db.from('org_subscription_invoices')
    .select('id, org_id, invoice_number, amount_cents, currency, status, gateway_order_id')
    .eq('id', invoiceId).eq('org_id', orgId).maybeSingle()
  if (!inv) return { success: false, error: 'Invoice not found.', status: 404 }
  if (inv.status !== 'issued') return { success: false, error: inv.status === 'paid' ? 'This invoice is already paid.' : 'This invoice can no longer be paid.', status: 409 }

  let orderId = inv.gateway_order_id as string | null
  if (!orderId) {
    try {
      const order = await createOrder(cfg, {
        amountPaise: Number(inv.amount_cents), currency: inv.currency, receipt: inv.invoice_number,
        notes: { org_id: orgId, invoice_id: inv.id, invoice_number: inv.invoice_number },
      }, fetchImpl)
      orderId = order.id
    } catch (e) {
      console.error('razorpay order failed:', (e as Error).message)
      return { success: false, error: 'Could not start the payment. Please try again in a minute.', status: 502 }
    }
    // Only an unpaid invoice without an order gets this one (a concurrent checkout keeps the first order).
    const { data: saved } = await db.from('org_subscription_invoices')
      .update({ gateway: 'razorpay', gateway_order_id: orderId, checkout_by: authUserId, updated_at: new Date().toISOString() })
      .eq('id', inv.id).eq('status', 'issued').is('gateway_order_id', null).select('gateway_order_id').maybeSingle()
    if (!saved) {
      const { data: again } = await db.from('org_subscription_invoices').select('gateway_order_id').eq('id', inv.id).maybeSingle()
      orderId = again?.gateway_order_id ?? orderId
    }
  } else {
    await db.from('org_subscription_invoices').update({ checkout_by: authUserId }).eq('id', inv.id).eq('status', 'issued')
  }
  return { success: true, data: { orderId: orderId!, amountPaise: Number(inv.amount_cents), currency: inv.currency, invoiceNumber: inv.invoice_number } }
}

export type SettleResult = DalResult<{ status: 'settled' | 'already_settled'; orgId: string; invoiceId: string }>

/** Settle a captured payment. The caller has verified Razorpay's signature; the database checks the rest. */
export async function settlePayment(orderId: string, paymentId: string, amountPaise: number, currency: string): Promise<SettleResult> {
  const { data, error } = await createServiceClient().rpc('billing_settle_gateway_payment', {
    p_order_id: orderId, p_payment_id: paymentId, p_amount_cents: amountPaise, p_currency: currency,
  })
  if (error) {
    console.error('billing settle refused:', error.message)
    // A refusal the database explains ("billing: …") is final; anything else may be temporary (500 → retry).
    const status = /unknown order/.test(error.message) ? 404 : /billing: /.test(error.message) ? 409 : 500
    return { success: false, error: friendly(error.message), status }
  }
  const r = data as { status: 'settled' | 'already_settled'; org_id: string; invoice_id: string }
  return { success: true, data: { status: r.status, orgId: r.org_id, invoiceId: r.invoice_id } }
}

/**
 * After the checkout callback: the signature proved the pairing; now confirm with Razorpay that the payment is
 * captured, for this order, then settle with Razorpay's amount (not the browser's). The order must belong to
 * an invoice of this organisation.
 */
export async function confirmCheckout(
  cfg: RazorpayConfig, orgId: string, orderId: string, paymentId: string, fetchImpl: typeof fetch = fetch
): Promise<SettleResult | DalResult<{ status: 'pending' }>> {
  const db = createServiceClient()
  const { data: inv } = await db.from('org_subscription_invoices').select('id').eq('org_id', orgId).eq('gateway_order_id', orderId).maybeSingle()
  if (!inv) return { success: false, error: 'Invoice not found.', status: 404 }
  let payment
  try { payment = await fetchPayment(cfg, paymentId, fetchImpl) } catch (e) {
    console.error('razorpay fetch payment failed:', (e as Error).message)
    return { success: false, error: 'Could not confirm the payment yet. It will update automatically when Razorpay confirms it.', status: 502 }
  }
  if (payment.order_id !== orderId) return { success: false, error: 'Payment does not belong to this invoice.', status: 400 }
  if (payment.status === 'authorized') return { success: true, data: { status: 'pending' } } // captured shortly; the webhook settles it
  if (payment.status !== 'captured') return { success: false, error: 'The payment did not go through.', status: 402 }
  return settlePayment(orderId, payment.id, payment.amount, payment.currency)
}
