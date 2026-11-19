// lib/payments/mandates.ts — recurring payments by mandate (UPI AutoPay first; e-NACH and card later). Everything
// here refuses to run while billing_settings.recurring_payments_enabled is false (the database enforces it too), so
// recurring payments stay off until merchant approval and the full test plan are complete.
//
// Cycle (hourly job): an active mandate's subscription close to its period end gets its renewal invoice (at the
// contracted price — never the catalogue price); a charge is scheduled for it; the organisation's owners are told
// the amount and date at least the configured notice period (≥ 24 h) before the debit; only then is the charge sent
// to the provider. Success settles the invoice like any payment (webhook); failure is retried up to 3 times; a
// cancelled or expired mandate cancels pending charges and the invoice stays payable manually.
import { getEmailAdapter, type EmailAdapter } from '@/lib/email/adapter'
import { renderEmail } from '@/lib/email/layout'
import type { AdapterResolver, Db } from './registry'
import type { ProviderCode } from './types'
import type { Result } from './service'

const fail = (error: string, status: number): Result<never> => ({ success: false, error, status })
const rupees = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100)

export async function recurringEnabled(db: Db): Promise<boolean> {
  const { data } = await db.from('billing_settings').select('recurring_payments_enabled').single()
  return !!data?.recurring_payments_enabled
}

export async function startMandate(db: Db, resolver: AdapterResolver, input: { orgId: string; userId: string; maxPaise: number; customer: { email?: string | null; phone?: string | null; name?: string | null } }): Promise<Result<{ mandateId: string; authorisationUrl: string | null }>> {
  if (!(await recurringEnabled(db))) return fail('Automatic payments are not available yet.', 503)
  const { data: g } = await db.from('payment_gateway_configs').select('provider').eq('environment', resolver.environment).eq('is_primary', true).maybeSingle()
  const adapter = g ? resolver.get(g.provider as ProviderCode) : null
  if (!adapter?.mandates) return fail('Automatic payments are not available with the current payment provider.', 503)
  const { data: id, error } = await db.rpc('payment_mandate_create', {
    p_actor: input.userId, p_org: input.orgId, p_provider: adapter.code, p_env: adapter.environment, p_method: 'upi_autopay', p_max: input.maxPaise, p_frequency: 'as_presented',
  })
  if (error) return fail(error.message.replace(/^.*?payments: /, ''), 409)
  try {
    const m = await adapter.mandates.createMandate({ reference: `rgm_${String(id).replace(/-/g, '')}`, orgId: input.orgId, maxAmountPaise: input.maxPaise, frequency: 'as_presented', method: 'upi_autopay', customer: { id: input.userId, ...input.customer } })
    await db.rpc('payment_mandate_transition', { p_mandate: id, p_to: 'pending_authorisation', p_source: 'system', p_actor: input.userId, p_detail: 'sent to provider', p_provider_ref: m.mandateId, p_auth_url: m.authorisationUrl })
    return { success: true, data: { mandateId: id as string, authorisationUrl: m.authorisationUrl } }
  } catch (e) {
    await db.rpc('payment_mandate_transition', { p_mandate: id, p_to: 'failed', p_source: 'system', p_actor: input.userId, p_detail: (e as Error).message.slice(0, 200) })
    return fail('Could not start automatic payments. Please try again later.', 502)
  }
}

export async function cancelMandate(db: Db, resolver: AdapterResolver, input: { orgId: string; mandateId: string; userId: string; source: 'customer' | 'staff'; reason: string }): Promise<Result<{ status: string }>> {
  const { data: m } = await db.from('payment_mandates').select('id, org_id, provider, environment, provider_mandate_id, status').eq('id', input.mandateId).eq('org_id', input.orgId).maybeSingle()
  if (!m) return fail('Mandate not found.', 404)
  if (['cancelled', 'expired', 'failed'].includes(m.status)) return { success: true, data: { status: m.status } }
  const adapter = resolver.get(m.provider, m.environment)
  if (m.provider_mandate_id) {
    if (!adapter?.mandates) return fail('The payment provider cannot be reached to cancel; please try again shortly.', 503)
    try { await adapter.mandates.cancelMandate(m.provider_mandate_id) } catch { return fail('The payment provider did not confirm the cancellation; please try again.', 502) }
  }
  const { data } = await db.rpc('payment_mandate_transition', { p_mandate: m.id, p_to: 'cancelled', p_source: input.source, p_actor: input.userId, p_detail: input.reason })
  return { success: true, data: { status: (data as { status: string })?.status ?? 'cancelled' } }
}

/** One pass of the recurring cycle. Safe to run repeatedly; each step is idempotent. */
export async function runMandateCycle(db: Db, resolver: AdapterResolver, opts: { now?: Date; email?: EmailAdapter; renewalLeadDays?: number } = {}) {
  const now = opts.now ?? new Date()
  const summary = { skipped: false, invoices: 0, scheduled: 0, notified: 0, submitted: 0, errors: [] as string[] }
  if (!(await recurringEnabled(db))) return { ...summary, skipped: true }
  const email = opts.email ?? getEmailAdapter()
  const { data: mandates } = await db.from('payment_mandates').select('id, org_id, subscription_id, provider, environment, provider_mandate_id, max_amount_cents').eq('status', 'active')
  for (const m of mandates ?? []) {
    const { data: sub } = await db.from('org_subscriptions').select('current_period_end, status').eq('id', m.subscription_id).single()
    const due = sub?.current_period_end ? new Date(sub.current_period_end) : null
    if (sub && ['active', 'past_due'].includes(sub.status) && due && due.getTime() - now.getTime() <= (opts.renewalLeadDays ?? 3) * 86_400_000) {
      const { error } = await db.rpc('billing_issue_renewal_invoice', { p_org: m.org_id, p_actor_profile: null })
      if (error) summary.errors.push(`renewal ${m.org_id}: ${error.message}`); else summary.invoices++
    }
    const { data: open } = await db.from('org_subscription_invoices').select('id').eq('org_id', m.org_id).eq('invoice_type', 'renewal').eq('status', 'issued')
    for (const inv of open ?? []) {
      const { error } = await db.rpc('payment_mandate_schedule_charge', { p_mandate: m.id, p_invoice: inv.id })
      if (error) summary.errors.push(`schedule ${inv.id}: ${error.message}`); else summary.scheduled++
    }
  }
  // Pre-debit notice to the owners, then the debit once the notice period has passed.
  const { data: charges } = await db.from('payment_mandate_charges').select('id, mandate_id, invoice_id, amount_cents, status, charge_after, next_retry_at, attempt_count').in('status', ['scheduled', 'notified', 'failed'])
  for (const c of charges ?? []) {
    const { data: m } = await db.from('payment_mandates').select('org_id, provider, environment, provider_mandate_id, status').eq('id', c.mandate_id).single()
    if (!m || m.status !== 'active') continue
    if (c.status === 'scheduled') {
      const { data: after, error } = await db.rpc('payment_mandate_charge_notified', { p_charge: c.id })
      if (error) { summary.errors.push(`notify ${c.id}: ${error.message}`); continue }
      await sendDebitNotice(db, email, m.org_id, Number(c.amount_cents), new Date(after as string))
      await db.from('org_audit_logs').insert({ org_id: m.org_id, actor_kind: 'system', actor_label: 'REGrow billing', action: 'billing.mandate_debit_notice', target_type: 'payment_mandate_charges', target_id: c.id, metadata: { amount_cents: c.amount_cents, debit_after: after } })
      summary.notified++
      continue
    }
    const ready = c.status === 'notified' ? new Date(c.charge_after).getTime() <= now.getTime() : !!c.next_retry_at && new Date(c.next_retry_at).getTime() <= now.getTime() && c.attempt_count < 3
    if (!ready) continue
    const adapter = resolver.get(m.provider, m.environment)
    if (!adapter?.mandates || !m.provider_mandate_id) { summary.errors.push(`charge ${c.id}: provider unavailable`); continue }
    try {
      const out = await adapter.mandates.chargeMandate({ mandateId: m.provider_mandate_id, chargeReference: `rgc_${c.id.replace(/-/g, '')}_${c.attempt_count + 1}`, amountPaise: Number(c.amount_cents), scheduleAt: new Date(now.getTime() + 26 * 3_600_000).toISOString(), note: 'REGrow subscription renewal' })
      const { error } = await db.rpc('payment_mandate_charge_submit', { p_charge: c.id, p_provider_charge_id: out.chargeId, p_now: now.toISOString() })
      if (error) summary.errors.push(`submit ${c.id}: ${error.message}`); else summary.submitted++
    } catch (e) { summary.errors.push(`charge ${c.id}: ${(e as Error).message}`) }
  }
  return summary
}

async function sendDebitNotice(db: Db, email: EmailAdapter, orgId: string, amountPaise: number, debitAfter: Date) {
  const { data: org } = await db.from('organisations').select('name').eq('id', orgId).single()
  const { data: owners } = await db.from('org_members').select('profile_id').eq('org_id', orgId).eq('role', 'owner').eq('status', 'active')
  const ids = (owners ?? []).map((o: { profile_id: string }) => o.profile_id)
  const { data: profiles } = ids.length ? await db.from('profiles').select('auth_user_id').in('id', ids) : { data: [] }
  const to: string[] = []
  for (const p of (profiles ?? []) as { auth_user_id: string | null }[]) {
    if (!p.auth_user_id) continue
    const { data } = await db.auth.admin.getUserById(p.auth_user_id)
    if (data?.user?.email) to.push(data.user.email)
  }
  if (!to.length) return
  const when = new Intl.DateTimeFormat('en-IN', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(debitAfter)
  const { html, text } = renderEmail({
    preheader: `${rupees(amountPaise)} will be debited for your REGrow renewal`,
    heading: 'Upcoming automatic payment',
    paragraphs: [
      `Your REGrow subscription for ${org?.name ?? 'your workspace'} renews soon. ${rupees(amountPaise)} (including GST) will be debited through your UPI AutoPay mandate on or after ${when}.`,
      'You can cancel the mandate at any time from Plan & billing in REGrow, or from your UPI app. If you cancel, you can still pay the renewal invoice manually.',
    ],
  })
  await email.sendEmail({ to, subject: `Upcoming REGrow payment of ${rupees(amountPaise)}`, html, text })
}
