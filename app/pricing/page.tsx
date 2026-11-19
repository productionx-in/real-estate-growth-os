// app/pricing/page.tsx — Public pricing: plans, ROI calculator, what is included, FAQ.
import type { Metadata } from 'next'
import Link from 'next/link'
import { PRODUCT_NAME } from '@/lib/brand'
import { ONBOARDING_FEE_INR, formatInr } from '@/lib/marketing/pricing'
import { MarketingShell } from '@/components/marketing/MarketingShell'
import { PricingPlans } from '@/components/marketing/PricingPlans'
import { RoiCalculator } from '@/components/marketing/RoiCalculator'

export const metadata: Metadata = {
  title: { absolute: `Pricing — ${PRODUCT_NAME}` },
  description: 'Simple pricing for real-estate lead management: one price for your team, unlimited leads, no per-lead charges.',
}

const INCLUDED = [
  ['Unlimited leads and sources', 'No charge per lead, per form or per connected account.'],
  ['Every user gets every lead alert', 'Pricing per company, not per login — nobody shares a password to save money.'],
  ['Setup done with you', `Source connections, routing and training. ${formatInr(ONBOARDING_FEE_INR)} one-time, waived on annual plans for founding customers.`],
  ['Usage only where it costs us', 'WhatsApp messages beyond the included volume are billed at cost plus a small margin. Nothing else is metered.'],
]

const FAQ = [
  { q: 'Is there a free trial?', a: 'We run a 30-day paid pilot with a target agreed up front, such as nine in ten leads contacted within five minutes. If you continue, the pilot fee counts towards your annual plan.' },
  { q: 'What counts as a user?', a: 'Anyone who signs in: salespeople, managers and admins. Deactivated users free their seat straight away.' },
  { q: 'Can we change team size later?', a: 'Yes. Add users at any time; extra users are charged from the date they are added.' },
  { q: 'Are prices inclusive of GST?', a: 'No. All prices are in Indian rupees and exclude GST.' },
  { q: 'We are a channel-partner agency working with a developer on REGrow. Do we pay?', a: 'Yes — each agency has its own workspace and its own plan (REGrow for Agencies), and your buyers stay yours. A developer partnering with you does not pay for your workspace, and you do not pay for theirs.' },
]

export default function PricingPage() {
  return (
    <MarketingShell>
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-14 pb-16">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--brand)]">Pricing</p>
          <h1 className="mt-2 text-[36px] sm:text-[44px] font-extrabold tracking-tight leading-tight">One price for the whole sales team</h1>
          <p className="mt-4 text-[17px] text-[var(--foreground-muted)]">Unlimited leads. No per-lead charges. Every salesperson gets a login.</p>
        </div>
        <div className="mt-12"><PricingPlans /></div>
      </section>

      <section aria-labelledby="included-heading" className="bg-[var(--background)] border-y border-[var(--border)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16">
          <h2 id="included-heading" className="text-[26px] font-bold tracking-tight">Every plan includes</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {INCLUDED.map(([t, b]) => (
              <div key={t}>
                <h3 className="text-[15px] font-semibold">{t}</h3>
                <p className="mt-1.5 text-[14px] text-[var(--foreground-muted)] leading-relaxed">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section aria-labelledby="roi-heading" className="mx-auto max-w-6xl px-4 sm:px-6 py-20">
        <div className="max-w-2xl">
          <h2 id="roi-heading" className="text-[30px] font-bold tracking-tight">What are slow responses costing you?</h2>
          <p className="mt-3 text-[16px] text-[var(--foreground-muted)]">Move the sliders to match your business. Most developers are surprised by the first number.</p>
        </div>
        <div className="mt-8"><RoiCalculator /></div>
      </section>

      <section aria-labelledby="pricing-faq" className="mx-auto max-w-3xl px-4 sm:px-6 pb-20">
        <h2 id="pricing-faq" className="text-[26px] font-bold tracking-tight text-center">Pricing questions</h2>
        <div className="mt-8 divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {FAQ.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="flex items-center justify-between cursor-pointer list-none text-[16px] font-semibold">
                {f.q}
                <span className="ml-4 text-[var(--foreground-subtle)] group-open:rotate-45 transition-transform text-[20px] leading-none" aria-hidden="true">+</span>
              </summary>
              <p className="mt-2 text-[15px] text-[var(--foreground-muted)] leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-8 text-center text-[15px]">
          Still deciding? <Link href="/demo" className="font-semibold text-[var(--brand)] hover:underline">Book a 20-minute demo</Link>
        </p>
      </section>
    </MarketingShell>
  )
}
