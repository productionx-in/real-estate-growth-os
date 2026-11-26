// app/demo/page.tsx — Public demo / pilot request page.
import type { Metadata } from 'next'
import { CalendarCheck, FileBarChart, PlayCircle } from 'lucide-react'
import { PRODUCT_NAME } from '@/lib/brand'
import { PUBLIC_PLANS, type PublicPlan } from '@/lib/marketing/pricing'
import { MarketingShell } from '@/components/marketing/MarketingShell'
import { DemoRequestForm } from '@/components/marketing/DemoRequestForm'
import { INTERESTS, type InterestId } from '@/lib/marketing/interests'

export const metadata: Metadata = {
  title: { absolute: `Book a demo — ${PRODUCT_NAME}` },
  description: 'See RE by PX on your own lead sources in 20 minutes, and get a free lead-leakage audit of last month’s leads.',
  alternates: { canonical: '/demo' },
}

const EXPECT = [
  { icon: PlayCircle, title: '20-minute walkthrough', body: 'A lead arriving from Meta, routed by your rules, and on a salesperson’s screen in seconds.' },
  { icon: FileBarChart, title: 'Free lead-leakage audit', body: 'Run it yourself in a minute at /leakage-audit — or share last month’s export and we walk you through it on the call.' },
  { icon: CalendarCheck, title: 'A pilot plan, if it fits', body: 'A 30-day pilot with a target agreed up front. No long contract to start.' },
]

export const dynamic = 'force-dynamic'

const HEADINGS: Record<InterestId, { eyebrow: string; title: string; body: string }> = {
  demo: { eyebrow: 'Book a demo', title: 'See every lead reach the right person in seconds', body: 'Tell us a little about your team and we will set up a demo around your projects and lead sources.' },
  consultation: { eyebrow: 'Request a consultation', title: 'Talk through your sales process with us', body: 'Tell us how your team works today and where it struggles. We will come back with how RE by PX would fit — and where it would not.' },
  migration: { eyebrow: 'Migration assessment', title: 'Plan your move to RE by PX', body: 'Tell us what you use today. We will review your current setup and a sample export, and agree a written migration scope with you.' },
  contact: { eyebrow: 'Contact the team', title: 'Talk to the RE by PX team', body: 'Questions about the product, onboarding or plans — leave your details and we will call you back.' },
}

export default async function DemoPage({ searchParams }: { searchParams: Promise<{ plan?: string; interest?: string }> }) {
  const { plan, interest: rawInterest } = await searchParams
  const interest: InterestId = INTERESTS.some((i) => i.id === rawInterest) ? (rawInterest as InterestId) : 'demo'
  const h = HEADINGS[interest]
  const initialPlan: PublicPlan['id'] = PUBLIC_PLANS.some((p) => p.id === plan) ? (plan as PublicPlan['id']) : 'leads'

  return (
    <MarketingShell>
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-14 grid gap-12 lg:grid-cols-[1fr_1.15fr]">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--brand)]">{h.eyebrow}</p>
          <h1 className="mt-2 text-[34px] sm:text-[40px] font-extrabold tracking-tight leading-tight">{h.title}</h1>
          <p className="mt-4 text-[16px] text-[var(--foreground-muted)] leading-relaxed">{h.body}</p>
          <ul className="mt-8 space-y-6">
            {EXPECT.map((x) => (
              <li key={x.title} className="flex gap-4">
                <span className="w-10 h-10 flex-shrink-0 rounded-xl bg-[var(--brand-light)] text-[var(--brand)] flex items-center justify-center"><x.icon className="w-5 h-5" aria-hidden="true" /></span>
                <div>
                  <p className="text-[16px] font-semibold">{x.title}</p>
                  <p className="mt-1 text-[14px] text-[var(--foreground-muted)] leading-relaxed">{x.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-3xl border border-[var(--border)] bg-white p-6 sm:p-8 shadow-xl shadow-blue-900/5">
          <DemoRequestForm initialPlan={initialPlan} initialInterest={interest} connectionId={process.env.REGROW_DEMO_FORM_CONNECTION_ID?.trim() || null} />
        </div>
      </section>
    </MarketingShell>
  )
}
