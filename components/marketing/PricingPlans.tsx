'use client'
// components/marketing/PricingPlans.tsx
// Plan cards with a monthly / annual switch and a team-size input that prices extra users live.
import { useState } from 'react'
import Link from 'next/link'
import { Check, Clock } from 'lucide-react'
import { PUBLIC_PLANS, formatInr, monthlyPriceFor } from '@/lib/marketing/pricing'

export function PricingPlans() {
  const [annual, setAnnual] = useState(true)
  const [users, setUsers] = useState(10)

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
        <div role="radiogroup" aria-label="Billing period" className="inline-flex p-1 rounded-xl bg-[var(--surface-hover)] border border-[var(--border)]">
          {[
            { v: false, label: 'Monthly' },
            { v: true, label: 'Annual · 2 months free' },
          ].map((o) => (
            <button key={o.label} type="button" role="radio" aria-checked={annual === o.v} onClick={() => setAnnual(o.v)}
              className={`px-4 py-2 text-[14px] font-semibold rounded-lg transition-colors ${annual === o.v ? 'bg-white shadow-sm text-[var(--foreground)]' : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'}`}>
              {o.label}
            </button>
          ))}
        </div>
        <label className="inline-flex items-center gap-2 text-[14px] text-[var(--foreground-muted)]">
          Team size
          <input type="number" min={1} max={500} value={users}
            onChange={(e) => setUsers(Math.max(1, Math.min(500, Math.round(Number(e.target.value) || 1))))}
            className="w-20 px-3 py-2 rounded-lg border border-[var(--border-strong)] text-[var(--foreground)] font-semibold focus:outline-none focus:ring-2 focus:ring-blue-200" />
          users
        </label>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3 items-start">
        {PUBLIC_PLANS.map((plan) => {
          const monthly = monthlyPriceFor(plan, users)
          const extraUsers = plan.includedUsers !== null ? Math.max(0, users - plan.includedUsers) : 0
          return (
            <section key={plan.id} aria-labelledby={`plan-${plan.id}`}
              className={`relative rounded-2xl bg-white p-7 ${plan.highlight ? 'border-2 border-[var(--brand)] shadow-xl shadow-blue-900/10 lg:-mt-3' : 'border border-[var(--border)]'}`}>
              {plan.highlight && (
                <span className="absolute -top-3 left-7 px-3 py-0.5 text-[12px] font-semibold text-white bg-[var(--brand)] rounded-full">Most teams start here</span>
              )}
              <h2 id={`plan-${plan.id}`} className="text-[18px] font-bold">{plan.name}</h2>
              <p className="mt-1 text-[14px] text-[var(--foreground-muted)] min-h-[42px]">{plan.audience}</p>

              <div className="mt-5 min-h-[92px]">
                {monthly === null ? (
                  <>
                    <p className="text-[32px] font-extrabold tracking-tight">Custom</p>
                    <p className="text-[13px] text-[var(--foreground-muted)]">Priced for your teams and cities</p>
                  </>
                ) : (
                  <>
                    <p className="flex items-baseline gap-1">
                      <span className="text-[34px] font-extrabold tracking-tight">{formatInr(annual ? (monthly * 10) / 12 : monthly)}</span>
                      <span className="text-[14px] text-[var(--foreground-muted)]">/ month</span>
                    </p>
                    <p className="text-[13px] text-[var(--foreground-muted)]">
                      {annual ? `${formatInr(monthly * 10)} billed yearly` : 'Billed monthly'} · {users} user{users === 1 ? '' : 's'}
                      {extraUsers > 0 && ` (${plan.includedUsers} included + ${extraUsers} × ${formatInr(plan.extraUserInr!)})`}
                    </p>
                    <p className="text-[12px] text-[var(--foreground-subtle)] mt-0.5">Excludes GST</p>
                  </>
                )}
              </div>

              <Link href={`/demo?plan=${plan.id}`}
                className={`mt-6 block text-center px-4 py-3 text-[15px] font-semibold rounded-xl transition-colors ${plan.highlight ? 'text-white bg-[var(--brand)] hover:bg-[var(--brand-hover)]' : 'text-[var(--foreground)] border border-[var(--border-strong)] hover:bg-[var(--surface-hover)]'}`}>
                {plan.cta}
              </Link>

              <ul className="mt-7 space-y-3">
                {plan.features.map((f) => (
                  <li key={f.text} className="flex gap-2.5 text-[14px]">
                    {f.soon
                      ? <Clock className="w-4 h-4 mt-0.5 text-[var(--foreground-subtle)] flex-shrink-0" aria-hidden="true" />
                      : <Check className="w-4 h-4 mt-0.5 text-emerald-600 flex-shrink-0" aria-hidden="true" />}
                    <span className={f.soon ? 'text-[var(--foreground-muted)]' : ''}>
                      {f.text}
                      {f.soon && <span className="ml-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-px">Coming soon</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
