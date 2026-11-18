// lib/billing/plans.ts — billing labels and small rules shared by the billing page and API. No server imports.
import type { MemberRole } from '@/types/database'

/** Only owners and admins see or change billing. */
export const canManageBilling = (role: MemberRole | null | undefined) => role === 'owner' || role === 'admin'

export type SubscriptionStatus = 'trial' | 'pending_payment' | 'active' | 'past_due' | 'canceled' | 'expired'

export const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trial: 'Free trial', pending_payment: 'Awaiting payment', active: 'Active', past_due: 'Payment overdue', canceled: 'Cancelled', expired: 'Expired',
}

export const INVOICE_TYPE_LABEL: Record<string, string> = { subscription: 'Plan', renewal: 'Renewal', additional_seats: 'Extra seats' }

/** Whole days left until `end` (0 when past), counting a part day as a day. */
export function daysLeft(end: string | null | undefined, now = new Date()): number | null {
  if (!end) return null
  const ms = new Date(end).getTime() - now.getTime()
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000)
}

/** Renewal opens 15 days before the period ends (the database enforces the same rule). */
export const RENEWAL_WINDOW_DAYS = 15

/** Paise → "₹1,41,600" (Indian grouping; paise shown only when not whole rupees). */
export function rupees(paise: number): string {
  const r = paise / 100
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: Number.isInteger(r) ? 0 : 2, maximumFractionDigits: 2 }).format(r)
}

/** What the workspace owner should be told, if anything, in the banner. */
export function billingNotice(status: SubscriptionStatus | null, periodEnd: string | null, now = new Date()):
  { tone: 'info' | 'warning' | 'danger'; text: string } | null {
  const left = daysLeft(periodEnd, now)
  if (status === 'trial' && left !== null) {
    if (left === 0) return { tone: 'danger', text: 'Your free trial has ended. Choose a plan to keep adding your team.' }
    if (left <= 7) return { tone: 'warning', text: `Your free trial ends in ${left} ${left === 1 ? 'day' : 'days'}.` }
    return null
  }
  if (status === 'past_due') return { tone: 'danger', text: 'Your subscription payment is overdue.' }
  if (status === 'expired' || status === 'canceled') return { tone: 'danger', text: 'Your subscription has ended. Choose a plan to continue.' }
  if (status === 'pending_payment') return { tone: 'info', text: 'Your plan is waiting for payment.' }
  if (status === 'active' && left !== null && left <= 7) return { tone: 'warning', text: `Your plan renews in ${left} ${left === 1 ? 'day' : 'days'} — renew now to avoid a break.` }
  return null
}
