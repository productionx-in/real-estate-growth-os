// app/page.tsx — Public front page. Signed-in users go straight to their workspace.
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  ArrowRight, BellRing, Building2, CalendarClock, Check, ClipboardList, Inbox, Lock, MessageCircleWarning,
  Repeat, ShieldCheck, Shuffle, UserCheck, Users,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PRODUCT_NAME } from '@/lib/brand'
import { PUBLIC_PLANS, formatInr } from '@/lib/marketing/pricing'
import { MarketingShell } from '@/components/marketing/MarketingShell'
import { LeadFlowPreview } from '@/components/marketing/LeadFlowPreview'

export const metadata: Metadata = {
  title: { absolute: `${PRODUCT_NAME} — Every real-estate lead called in minutes` },
  description:
    'REGrow captures leads from Meta, Google, property portals, your website and WhatsApp, assigns each one to the right salesperson in seconds and makes sure someone follows up.',
}

const SOURCES = ['Meta lead forms', 'Google Ads', '99acres', 'MagicBricks', 'Housing.com', 'Website forms', 'WhatsApp', 'Walk-ins & referrals', 'CSV import']

const LEAKS = [
  { icon: Inbox, title: 'Leads wait in five inboxes', body: 'Facebook, Google, three portals and the website each keep their own list. Someone has to check them all, every hour.' },
  { icon: MessageCircleWarning, title: '“Who is calling this one?”', body: 'Leads get forwarded to a WhatsApp group. Two people call the same buyer, or nobody does.' },
  { icon: CalendarClock, title: 'Follow-ups live in memory', body: 'The buyer said “call me Thursday”. Thursday is busy. The lead you paid for goes quiet.' },
]

const STEPS = [
  { n: '1', icon: Inbox, title: 'Capture', body: 'Connect your ad accounts, portals and website once. Every enquiry lands in one list, duplicates merged.' },
  { n: '2', icon: Shuffle, title: 'Route', body: 'Your rules pick the team — by project, source or campaign — and the next salesperson in a fair rotation.' },
  { n: '3', icon: BellRing, title: 'Alert', body: 'The salesperson is notified the moment the lead is theirs, with the buyer’s details one tap away.' },
  { n: '4', icon: ClipboardList, title: 'Follow up', body: 'Managers see every lead, who has it and why. Follow-up reminders and 5-minute escalation are coming next.' },
]

const FEATURES = [
  { icon: Shuffle, title: 'Routing rules you can read', body: 'Plain-language rules like “Skyline Towers leads from Meta go to the Towers desk”. Checked top to bottom.' },
  { icon: Users, title: 'Fair, adjustable rotation', body: 'Give senior closers a bigger share, cap leads per day, and let people switch themselves off duty for site visits.' },
  { icon: Repeat, title: 'Returning buyers stay with their salesperson', body: 'When the same phone number enquires again, it goes back to whoever already knows them.' },
  { icon: UserCheck, title: 'Every assignment explained', body: 'Managers see which rule fired and why a person was chosen — no more arguments about who got the good leads.' },
  { icon: Building2, title: 'Built for developers and channel partners', body: 'Channel-partner agencies get their own independent workspace and keep ownership of their leads.' },
  { icon: ShieldCheck, title: 'Your data, locked to your company', body: 'Each company’s data is separated inside the database itself, not just hidden in the app. Inactive users lose access immediately.' },
]

const FAQ = [
  { q: 'How long does setup take?', a: 'Most teams are live in a day: we connect your lead sources, set up your teams and rules with you, and import your existing leads.' },
  { q: 'Can we keep Sell.Do or our current CRM?', a: 'Yes. You can run REGrow in front of your current CRM for lead capture and response, or move fully with our import. Many teams start side by side.' },
  { q: 'Do you charge per lead?', a: 'No. The plan price covers unlimited leads and reminders. Only services that cost us per message — such as WhatsApp alerts beyond the included volume — are billed at usage.' },
  { q: 'What happens to a lead when nobody is available?', a: 'It stays unassigned instead of going to someone who is off duty or over their daily limit, and your managers are notified straight away.' },
  { q: 'Who owns the data?', a: 'You do. Channel-partner agencies have their own independent workspace and own their leads.' },
]

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/select-org')

  const leads = PUBLIC_PLANS.find((p) => p.id === 'leads')!

  return (
    <MarketingShell>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_#eff6ff_0%,_transparent_55%)]" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-14 pb-16 md:pt-20 md:pb-24 grid gap-12 md:grid-cols-[1.1fr_1fr] items-center">
          <div>
            <p className="inline-flex items-center gap-2 text-[13px] font-medium text-[var(--brand)] bg-[var(--brand-light)] border border-blue-200 rounded-full px-3 py-1">
              For real-estate developers and channel partners
            </p>
            <h1 className="mt-5 text-[38px] sm:text-[48px] leading-[1.05] font-extrabold tracking-tight">
              Every lead called in <span className="text-[var(--brand)]">minutes</span>, not hours.
            </h1>
            <p className="mt-5 text-[17px] leading-relaxed text-[var(--foreground-muted)] max-w-xl">
              {PRODUCT_NAME} pulls enquiries from Meta, Google, property portals, your website and WhatsApp, hands each one to the
              right salesperson in seconds, and tells them the moment it is theirs.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link href="/demo" className="inline-flex items-center justify-center gap-2 px-5 py-3 text-[15px] font-semibold text-white bg-[var(--brand)] hover:bg-[var(--brand-hover)] rounded-xl shadow-sm transition-colors">
                Book a 20-minute demo <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
              <Link href="/pricing" className="inline-flex items-center justify-center px-5 py-3 text-[15px] font-semibold text-[var(--foreground)] bg-white border border-[var(--border-strong)] hover:bg-[var(--surface-hover)] rounded-xl transition-colors">
                See pricing
              </Link>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-[var(--foreground-muted)]">
              {[`${formatInr(leads.monthlyInr!)}/month for ${leads.includedUsers} users`, 'No per-lead charges', 'Live in a day'].map((t) => (
                <li key={t} className="inline-flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-600" aria-hidden="true" />{t}</li>
              ))}
            </ul>
          </div>
          <LeadFlowPreview />
        </div>
      </section>

      {/* Sources */}
      <section aria-labelledby="sources-heading" className="border-y border-[var(--border)] bg-[var(--background)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8">
          <h2 id="sources-heading" className="text-center text-[13px] font-semibold uppercase tracking-wider text-[var(--foreground-subtle)]">
            One inbox for every place buyers enquire
          </h2>
          <ul className="mt-5 flex flex-wrap justify-center gap-2.5">
            {SOURCES.map((s) => (
              <li key={s} className="px-3.5 py-1.5 text-[13px] font-medium bg-white border border-[var(--border)] rounded-full text-[var(--foreground)]">{s}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* Problem */}
      <section aria-labelledby="leaks-heading" className="mx-auto max-w-6xl px-4 sm:px-6 py-20">
        <div className="max-w-2xl">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--brand)]">The problem</p>
          <h2 id="leaks-heading" className="mt-2 text-[30px] sm:text-[36px] font-bold tracking-tight leading-tight">
            You pay for every lead. Too many are never called back in time.
          </h2>
          <p className="mt-4 text-[16px] text-[var(--foreground-muted)] leading-relaxed">
            A buyer who fills a form is comparing three projects that evening. The developer who calls first gets the site visit.
            Here is where the time goes.
          </p>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {LEAKS.map((l) => (
            <div key={l.title} className="rounded-2xl border border-[var(--border)] p-6 bg-white">
              <span className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center"><l.icon className="w-5 h-5" aria-hidden="true" /></span>
              <h3 className="mt-4 text-[17px] font-semibold">{l.title}</h3>
              <p className="mt-2 text-[14px] text-[var(--foreground-muted)] leading-relaxed">{l.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" aria-labelledby="how-heading" className="bg-[#0b1220] text-white scroll-mt-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-20">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-blue-300">How it works</p>
          <h2 id="how-heading" className="mt-2 text-[30px] sm:text-[36px] font-bold tracking-tight">From form to first call, without anyone forwarding anything</h2>
          <ol className="mt-12 grid gap-6 md:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.n} className="rounded-2xl bg-white/5 border border-white/10 p-6">
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-200 flex items-center justify-center"><s.icon className="w-5 h-5" aria-hidden="true" /></span>
                  <span className="text-[12px] font-mono text-slate-400">Step {s.n}</span>
                </div>
                <h3 className="mt-4 text-[18px] font-semibold">{s.title}</h3>
                <p className="mt-2 text-[14px] text-slate-300 leading-relaxed">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Features */}
      <section id="features" aria-labelledby="features-heading" className="mx-auto max-w-6xl px-4 sm:px-6 py-20 scroll-mt-16">
        <div className="max-w-2xl">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--brand)]">Built for how Indian real-estate sales teams work</p>
          <h2 id="features-heading" className="mt-2 text-[30px] sm:text-[36px] font-bold tracking-tight leading-tight">Fast for salespeople. Clear for managers.</h2>
        </div>
        <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title}>
              <span className="w-10 h-10 rounded-xl bg-[var(--brand-light)] text-[var(--brand)] flex items-center justify-center"><f.icon className="w-5 h-5" aria-hidden="true" /></span>
              <h3 className="mt-4 text-[16px] font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-[14px] text-[var(--foreground-muted)] leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Switch */}
      <section id="switch" aria-labelledby="switch-heading" className="bg-[var(--background)] border-y border-[var(--border)] scroll-mt-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-20 grid gap-10 md:grid-cols-2 items-center">
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--brand)]">Switching is low-risk</p>
            <h2 id="switch-heading" className="mt-2 text-[30px] font-bold tracking-tight leading-tight">On Sell.Do, LeadSquared or spreadsheets today?</h2>
            <p className="mt-4 text-[16px] text-[var(--foreground-muted)] leading-relaxed">
              Start with a 30-day paid pilot. We agree the target with you up front — for example, nine in ten leads contacted within
              five minutes — and measure it from day one. If you continue, the pilot fee counts towards your annual plan.
            </p>
          </div>
          <ul className="space-y-4">
            {[
              ['Bring your leads with you', 'Import your existing leads from a CSV export of your current CRM.'],
              ['Run side by side', 'Keep your current CRM for post-sales while REGrow handles capture and response.'],
              ['See the before and after', 'We measure your current response time from your export, then show the change every week.'],
            ].map(([t, b]) => (
              <li key={t} className="flex gap-3 bg-white rounded-2xl border border-[var(--border)] p-5">
                <Check className="w-5 h-5 mt-0.5 text-emerald-600 flex-shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-[15px] font-semibold">{t}</p>
                  <p className="mt-1 text-[14px] text-[var(--foreground-muted)]">{b}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Pricing teaser */}
      <section aria-labelledby="price-heading" className="mx-auto max-w-6xl px-4 sm:px-6 py-20">
        <div className="rounded-3xl bg-gradient-to-br from-[var(--brand)] to-indigo-700 text-white p-8 md:p-12 grid gap-8 md:grid-cols-[1.3fr_1fr] items-center">
          <div>
            <h2 id="price-heading" className="text-[28px] sm:text-[34px] font-bold tracking-tight leading-tight">One clear price for the whole team</h2>
            <p className="mt-3 text-[16px] text-blue-100 leading-relaxed">
              {leads.name}: {formatInr(leads.monthlyInr!)} a month including {leads.includedUsers} users, then {formatInr(leads.extraUserInr!)} per extra user.
              Unlimited leads. Pay annually and get two months free.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row md:flex-col lg:flex-row gap-3 md:justify-self-end">
            <Link href="/pricing" className="inline-flex items-center justify-center px-5 py-3 text-[15px] font-semibold text-[var(--brand)] bg-white hover:bg-blue-50 rounded-xl transition-colors">
              Compare plans
            </Link>
            <Link href="/demo" className="inline-flex items-center justify-center px-5 py-3 text-[15px] font-semibold text-white border border-white/40 hover:bg-white/10 rounded-xl transition-colors">
              Book a demo
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq-heading" className="mx-auto max-w-3xl px-4 sm:px-6 pb-20">
        <h2 id="faq-heading" className="text-[28px] font-bold tracking-tight text-center">Questions buyers ask us</h2>
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
        <p className="mt-10 text-center text-[14px] text-[var(--foreground-muted)] inline-flex w-full justify-center items-center gap-2">
          <Lock className="w-4 h-4" aria-hidden="true" /> Already a customer? <Link href="/login" className="font-semibold text-[var(--brand)] hover:underline">Sign in</Link>
        </p>
      </section>
    </MarketingShell>
  )
}
