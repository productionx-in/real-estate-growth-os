'use client'
// components/billing/BillingClient.tsx — the billing page's interactive parts: start a trial, choose a plan,
// add seats, renew, and pay an invoice with the primary payment provider's checkout (Razorpay or Cashfree). Every
// action is checked again on the server; a payment counts only after the server has confirmed it with the provider.
import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CreditCard, FileText, Plus, RefreshCw, Sparkles, Users } from 'lucide-react'
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input } from '@/components/ui'
import { cn } from '@/lib/utils/cn'
import { INVOICE_TYPE_LABEL, RENEWAL_WINDOW_DAYS, STATUS_LABEL, billingNotice, daysLeft, rupees } from '@/lib/billing/plans'
import type { BillingOverview } from '@/lib/dal/billing'

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void; on: (e: string, f: (r: unknown) => void) => void }
    Cashfree?: (opts: { mode: 'sandbox' | 'production' }) => { checkout: (o: { paymentSessionId: string; redirectTarget?: string }) => Promise<{ error?: { message?: string }; paymentDetails?: unknown; redirect?: boolean }> }
  }
}

const SDK = { razorpay: 'https://checkout.razorpay.com/v1/checkout.js', cashfree: 'https://sdk.cashfree.com/js/v3/cashfree.js' } as const

const STATUS_TONE = { trial: 'brand', pending_payment: 'warning', active: 'success', past_due: 'danger', canceled: 'neutral', expired: 'danger' } as const
const INVOICE_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = { issued: 'warning', paid: 'success', canceled: 'neutral', void: 'neutral' }
const date = (iso: string | null) => (iso ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)) : '—')

function loadCheckout(provider: keyof typeof SDK): Promise<void> {
  if (provider === 'razorpay' ? window.Razorpay : window.Cashfree) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SDK[provider]
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Could not load the payment window. Check your connection and try again.'))
    document.body.appendChild(s)
  })
}

export function BillingClient({ orgId, orgSlug, orgName, overview, payOnline }: {
  orgId: string; orgSlug: string; orgName: string; overview: BillingOverview; payOnline: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [cycle, setCycle] = React.useState<'monthly' | 'annual'>('annual')
  const [seats, setSeats] = React.useState(1)
  const sub = overview.subscription
  const open = overview.invoices.filter((i) => i.status === 'issued')
  const left = daysLeft(sub?.periodEnd)
  const banner = billingNotice(sub?.status ?? null, sub?.periodEnd ?? null)
  const canChoosePlan = !sub || !['active', 'past_due'].includes(sub.status)
  const canRenew = !!sub && ['active', 'past_due'].includes(sub.status) && (left === null || left <= RENEWAL_WINDOW_DAYS)
  const currentPlan = overview.plans.find((p) => p.code === sub?.planCode)

  async function post(url: string, body: unknown) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error || 'Something went wrong. Please try again.')
    return json
  }

  async function pay(invoiceId: string) {
    setBusy(`pay-${invoiceId}`); setError(null); setNotice(null)
    try {
      const o = await post(`/api/billing/invoices/${invoiceId}/checkout`, { orgId })
      if (o.alreadyPaid) { setNotice('This invoice has already been paid. Thank you!'); router.refresh(); return }
      await loadCheckout(o.provider)
      if (o.provider === 'cashfree') {
        const result = await window.Cashfree!({ mode: o.mode }).checkout({ paymentSessionId: o.paymentSessionId, redirectTarget: '_modal' })
        if (result.error) { setError('The payment did not go through. You have not been charged; please try again.'); return }
        try {
          const done = await post('/api/billing/payments/confirm', { orgId, provider: 'cashfree', orderId: o.orderId })
          setNotice(done.status === 'pending' ? 'Payment received — confirming with Cashfree. This page will update shortly.' : 'Payment received. Thank you!')
        } catch (e) { setError((e as Error).message) }
        router.refresh()
        return
      }
      await new Promise<void>((resolve) => {
        const rz = new window.Razorpay!({
          key: o.keyId, order_id: o.orderId, amount: o.amount, currency: o.currency,
          name: 'RE by PX', description: `${orgName} · invoice ${o.invoiceNumber}`,
          prefill: o.email ? { email: o.email } : undefined,
          theme: { color: getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() || undefined },
          handler: async (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
            try {
              const done = await post('/api/billing/payments/confirm', { orgId, provider: 'razorpay', orderId: r.razorpay_order_id, ...r })
              setNotice(done.status === 'pending' ? 'Payment received — confirming with Razorpay. This page will update shortly.' : 'Payment received. Thank you!')
            } catch (e) { setError((e as Error).message) }
            router.refresh(); resolve()
          },
          modal: { ondismiss: () => resolve() },
        })
        rz.on('payment.failed', () => { setError('The payment did not go through. You have not been charged; please try again.'); })
        rz.open()
      })
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(null) }
  }

  async function act(key: string, body: Record<string, unknown>, then?: (id: string) => Promise<void>) {
    setBusy(key); setError(null); setNotice(null)
    try {
      const { id } = await post('/api/billing/actions', { orgId, ...body })
      router.refresh()
      if (then && payOnline) await then(id)
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(null) }
  }

  return (
    <div className="max-w-5xl space-y-6">
      {banner && <Alert tone={banner.tone}>{banner.text}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}
      {!payOnline && open.length > 0 && (
        <Alert tone="info">Online payment isn&apos;t available yet. Your invoices are below — contact us to pay them.</Alert>
      )}

      {/* Current plan and seats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>{sub ? sub.planName : 'No plan yet'}</CardTitle>
              {sub && <Badge tone={STATUS_TONE[sub.status]}>{STATUS_LABEL[sub.status]}</Badge>}
            </div>
            <CardDescription>
              {!sub && 'Start a 14-day free trial, or choose a plan below.'}
              {sub?.status === 'trial' && (left ? `${left} ${left === 1 ? 'day' : 'days'} left in your free trial · ends ${date(sub.periodEnd)}` : `Trial ended ${date(sub.periodEnd)}`)}
              {sub && sub.status !== 'trial' && sub.periodEnd && `${sub.cycle === 'annual' ? 'Annual' : 'Monthly'} · ${sub.status === 'active' ? 'renews' : 'period ends'} ${date(sub.periodEnd)}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {!sub && overview.plans.map((p) => (
              <Button key={p.code} variant="secondary" disabled={!!busy} onClick={() => act(`trial-${p.code}`, { action: 'trial', plan: p.code })}>
                <Sparkles aria-hidden /> Start free trial{overview.plans.length > 1 ? ` · ${p.name}` : ''}
              </Button>
            ))}
            {canRenew && (
              <Button disabled={!!busy} onClick={() => act('renewal', { action: 'renewal' }, pay)}>
                <RefreshCw aria-hidden /> Renew {currentPlan ? `· ${rupees(sub!.cycle === 'annual' ? currentPlan.annualPaise : currentPlan.monthlyPaise)} + GST` : ''}
              </Button>
            )}
            {sub && ['trial', 'pending_payment', 'expired', 'canceled'].includes(sub.status) && (
              <p className="text-[13px] text-muted">Choose a plan below; it starts as soon as the first invoice is paid. Your team and data stay as they are.</p>
            )}
            {sub?.status === 'active' && !canRenew && (
              <p className="text-[13px] text-muted">Renewal opens {RENEWAL_WINDOW_DAYS} days before your plan renews.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users aria-hidden className="size-4 text-subtle" /> Seats</CardTitle>
            <CardDescription>Active members and pending invitations</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="tabular text-[24px] font-semibold text-foreground">
              {overview.seats.used + overview.seats.reserved}<span className="text-[15px] font-normal text-muted"> / {overview.seats.total || '—'}</span>
            </p>
            {overview.seats.total > 0 && (
              <div className="h-2 overflow-hidden rounded-full bg-surface-hover" role="progressbar" aria-label="Seats used"
                aria-valuemin={0} aria-valuemax={overview.seats.total} aria-valuenow={overview.seats.used + overview.seats.reserved}>
                <div className={cn('h-full rounded-full', overview.seats.used + overview.seats.reserved >= overview.seats.total ? 'bg-danger' : 'bg-brand')}
                  style={{ width: `${Math.min(100, ((overview.seats.used + overview.seats.reserved) / overview.seats.total) * 100)}%` }} />
              </div>
            )}
            <p className="text-[12px] text-muted">{sub ? `${sub.includedSeats} included${sub.additionalSeats ? ` + ${sub.additionalSeats} extra` : ''}` : 'Seats come with a plan or trial.'}</p>
            {overview.limits.some((l) => l.max !== null) && (
              <dl className="space-y-1 border-t border-default pt-3 text-[13px]" aria-label="Plan limits">
                {overview.limits.filter((l) => l.max !== null).map((l) => (
                  <div key={l.kind} className="flex justify-between gap-2">
                    <dt className="text-muted">{l.label}</dt>
                    <dd className={cn('tabular', l.used >= (l.max ?? 0) ? 'font-semibold text-danger' : 'text-foreground')}>{l.used} / {l.max}</dd>
                  </div>
                ))}
                <p className="pt-1 text-[12px] text-subtle">Enquiries from connected sources are always saved, even over the lead limit.</p>
              </dl>
            )}
            {sub?.status === 'active' && currentPlan && currentPlan.seatPaise > 0 && (
              <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); act('seats', { action: 'seats', seats }, pay) }}>
                <label className="flex-1 text-[12px] font-medium">
                  Add seats
                  <Input type="number" min={1} max={500} value={seats} onChange={(e) => setSeats(Math.max(1, Math.min(500, Number(e.target.value) || 1)))} className="mt-1" />
                </label>
                <Button type="submit" disabled={!!busy}><Plus aria-hidden /> Add</Button>
              </form>
            )}
            {sub?.status === 'active' && currentPlan && (
              <p className="text-[12px] text-subtle">{rupees(currentPlan.seatPaise * (sub.cycle === 'annual' ? 10 : 1))} per seat per {sub.cycle === 'annual' ? 'year' : 'month'} + GST, charged for the rest of this period.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Plans */}
      {canChoosePlan && overview.plans.length > 0 && (
        <section aria-labelledby="plans-h" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="plans-h" className="text-[15px] font-semibold">Choose a plan</h2>
            <div role="radiogroup" aria-label="Billing cycle" className="inline-flex rounded-lg border border-default bg-surface p-0.5 text-[13px]">
              {(['monthly', 'annual'] as const).map((c) => (
                <button key={c} type="button" role="radio" aria-checked={cycle === c} onClick={() => setCycle(c)}
                  className={cn('rounded-md px-3 py-1.5 font-medium', cycle === c ? 'bg-brand text-brand-foreground' : 'text-muted hover:text-foreground')}>
                  {c === 'monthly' ? 'Monthly' : 'Annual · 2 months free'}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {overview.plans.map((p) => {
              const price = cycle === 'annual' ? p.annualPaise : p.monthlyPaise
              return (
                <Card key={p.code}>
                  <CardHeader>
                    <CardTitle>{p.name}</CardTitle>
                    <CardDescription>{p.includedSeats} users included · extra users {rupees(p.seatPaise)}/month</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="tabular"><span className="text-[26px] font-semibold">{rupees(price)}</span><span className="text-[13px] text-muted"> / {cycle === 'annual' ? 'year' : 'month'} + GST</span></p>
                    <Button className="w-full" disabled={!!busy} onClick={() => act(`plan-${p.code}`, { action: 'plan', plan: p.code, cycle }, pay)}>
                      <CreditCard aria-hidden /> {payOnline ? `Choose & pay ${rupees(Math.round(price * 1.18))}` : 'Choose this plan'}
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
          <p className="text-[12px] text-subtle">Need more than one business unit, single sign-on or a custom contract? <Link className="text-brand hover:underline" href="/demo?plan=enterprise">Talk to us about Enterprise</Link>.</p>
        </section>
      )}

      {/* Invoices */}
      <section aria-labelledby="inv-h" className="space-y-3">
        <h2 id="inv-h" className="text-[15px] font-semibold">Invoices</h2>
        {overview.invoices.length === 0 ? (
          <p className="surface-raised rounded-2xl border border-dashed border-default bg-surface p-6 text-center text-[13px] text-muted">No invoices yet.</p>
        ) : (
          <div className="surface-raised overflow-x-auto rounded-2xl border border-default bg-surface">
            <table className="data-table w-full text-[13px]">
              <thead><tr className="border-b border-default text-left text-[12px] text-muted">
                <th className="px-4 py-2.5 font-medium">Invoice</th><th className="px-4 py-2.5 font-medium">For</th>
                <th className="px-4 py-2.5 font-medium">Date</th><th className="px-4 py-2.5 text-right font-medium">Total (incl. GST)</th>
                <th className="px-4 py-2.5 font-medium">Status</th><th className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
              </tr></thead>
              <tbody>
                {overview.invoices.map((i) => (
                  <tr key={i.id} className="border-b border-default last:border-0">
                    <td className="px-4 py-3 font-medium"><Link href={`/${orgSlug}/billing/invoices/${i.id}`} className="hover:text-brand">{i.number}</Link></td>
                    <td className="px-4 py-3 text-muted">{INVOICE_TYPE_LABEL[i.type] ?? i.type}{i.seats ? ` · ${i.seats} seat${i.seats > 1 ? 's' : ''}` : ''}{i.cycle ? ` · ${i.cycle}` : ''}</td>
                    <td className="px-4 py-3 text-muted">{date(i.paidAt ?? i.createdAt)}</td>
                    <td className="tabular px-4 py-3 text-right">{rupees(i.totalPaise)}</td>
                    <td className="px-4 py-3"><Badge tone={INVOICE_TONE[i.status] ?? 'neutral'}>{i.status === 'issued' ? 'Due' : i.status === 'paid' ? 'Paid' : i.status}</Badge></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {i.status === 'issued' && payOnline && <Button size="sm" disabled={!!busy} onClick={() => pay(i.id)}>{busy === `pay-${i.id}` ? 'Opening…' : 'Pay now'}</Button>}
                        <Button asChild size="sm" variant="ghost"><Link href={`/${orgSlug}/billing/invoices/${i.id}`}><FileText aria-hidden /> View</Link></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
