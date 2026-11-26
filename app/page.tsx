// app/page.tsx — Public front page, served static from the edge. Signed-in users are sent to their workspace by proxy.ts
// before this page renders, so it never reads the session itself.
import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowRight, BellRing, Building2, CalendarClock, Check, ClipboardList, Inbox, Lock, MessageCircleWarning,
  Repeat, ShieldCheck, Shuffle, UserCheck, Users,
} from 'lucide-react'
import { PRODUCT_NAME } from '@/lib/brand'
import { PRODUCT_DESCRIPTOR } from '@/lib/brand'
import { pagesIn } from '@/lib/marketing/site-pages'
import { MarketingShell } from '@/components/marketing/MarketingShell'
import { LeadFlowPreview } from '@/components/marketing/LeadFlowPreview'

export const metadata: Metadata = {
  title: { absolute: `${PRODUCT_NAME} — Real estate CRM, inventory and channel partner management software` },
  description:
    'Real estate CRM, property inventory, site visits, bookings and channel partner management in one platform for Indian developers and channel partner agencies.',
  alternates: { canonical: '/' },
}

// Ready to use: work without any third-party approval. With setup: need the customer's own account connected (and,
// for portals, API access granted by the portal) — the site must never imply these work out of the box.
const SOURCES = ['Website forms', 'Walk-ins & referrals', 'CSV import', 'Webhooks & API']
const SOURCES_WITH_SETUP = ['Meta lead forms', 'Google Ads lead forms', 'WhatsApp Business', '99acres', 'MagicBricks', 'Housing.com']

const LEAKS = [
  { icon: Inbox, title: 'Leads wait in five inboxes', body: 'Facebook, Google, three portals and the website each keep their own list. Someone has to check them all, every hour.' },
  { icon: MessageCircleWarning, title: '“Who is calling this one?”', body: 'Leads get forwarded to a WhatsApp group. Two people call the same buyer, or nobody does.' },
  { icon: CalendarClock, title: 'Follow-ups live in memory', body: 'The buyer said “call me Thursday”. Thursday is busy. The lead you paid for goes quiet.' },
]

const STEPS = [
  { n: '1', icon: Inbox, title: 'Capture', body: 'Connect your ad accounts, portals and website once. Every enquiry lands in one list, duplicates merged.' },
  { n: '2', icon: Shuffle, title: 'Route', body: 'Your rules pick the team — by project, source or campaign — and the next salesperson in a fair rotation.' },
  { n: '3', icon: BellRing, title: 'Alert', body: 'The salesperson is notified the moment the lead is theirs, with the buyer’s details one tap away.' },
  { n: '4', icon: ClipboardList, title: 'Follow up', body: 'Follow-up reminders keep every promised call on the list, and a lead nobody contacts in time is escalated to a manager. Managers see every lead, who has it and why.' },
]

const FEATURES = [
  { icon: Shuffle, title: 'Routing rules you can read', body: 'Plain-language rules like “Skyline Towers leads from Meta go to the Towers desk”. Checked top to bottom.' },
  { icon: Users, title: 'Fair, adjustable rotation', body: 'Give senior closers a bigger share, cap leads per day, and let people switch themselves off duty for site visits.' },
  { icon: Repeat, title: 'Returning buyers stay with their salesperson', body: 'When the same phone number enquires again, it goes back to whoever already knows them.' },
  { icon: UserCheck, title: 'Every assignment explained', body: 'Managers see which rule fired and why a person was chosen — no more arguments about who got the good leads.' },
  { icon: Building2, title: 'Built for developers and channel partners', body: 'Agencies have their own independent workspace and keep ownership of their buyers. Developers share chosen projects with partner agencies, who register buyers for review.' },
  { icon: ShieldCheck, title: 'Your data, locked to your company', body: 'Each company’s data is separated inside the database itself, not just hidden in the app. Inactive users lose access immediately.' },
]

const FAQ = [
  { q: 'How long does setup take?', a: 'We set it up with you: connect your lead sources, create your teams and routing rules, and import your existing leads. How long it takes depends mainly on how many sources you connect and whether they need third-party approval (Meta, Google, portals).' },
  { q: 'We already use a CRM. Can we move to RE?', a: 'Yes. We start with an assessment of your current system and a sample of your data, then plan the import of leads and contacts, project and inventory setup, workflows and team onboarding with you. Many teams run RE alongside their current tools during the transition.' },
  { q: 'What does RE include besides lead management?', a: 'Projects and property inventory with holds and bookings, site visits, channel partner sharing and buyer registration, sales analytics, roles and an audit log — in the same platform as your leads.' },
  { q: 'What happens to a lead when nobody is available?', a: 'It stays unassigned instead of going to someone who is off duty or over their daily limit, and your managers are notified straight away.' },
  { q: 'Who owns the data?', a: 'You do. Channel-partner agencies have their own independent workspace and own their leads.' },
]

export default function HomePage() {

  return (
    <MarketingShell>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden="true" className="hero-mist absolute inset-0" />
        <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-14 pb-16 md:pt-20 md:pb-24 grid gap-12 md:grid-cols-[1.1fr_1fr] items-center">
          <div>
            <p className="inline-flex items-center gap-2 text-[13px] font-medium text-[var(--brand)] bg-[var(--brand-light)] border border-brand/20 rounded-full px-3 py-1">
              The {PRODUCT_DESCRIPTOR} for developers and channel partners
            </p>
            <h1 className="mt-5 text-[36px] sm:text-[48px] leading-[1.05] font-extrabold tracking-tight">
              Every lead answered. Every unit accounted for. <span className="text-[var(--brand)]">Every partner on record.</span>
            </h1>
            <p className="mt-5 text-[17px] leading-relaxed text-[var(--foreground-muted)] max-w-xl">
              {PRODUCT_NAME} connects lead management, sales teams, projects and property inventory, site visits, bookings and channel
              partner workflows in one platform — so real estate developers and agencies sell from the same, current picture.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link href="/demo" className="inline-flex items-center justify-center gap-2 px-5 py-3 text-[15px] font-semibold text-white bg-[var(--brand)] hover:bg-[var(--brand-hover)] rounded-xl shadow-sm transition-colors">
                Book a 20-minute demo <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
              <Link href="/tour" className="inline-flex items-center justify-center px-5 py-3 text-[15px] font-semibold text-[var(--foreground)] bg-white border border-[var(--border-strong)] hover:bg-[var(--surface-hover)] rounded-xl transition-colors">
                Take the 2-minute tour
              </Link>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-[var(--foreground-muted)]">
              {['Built for Indian real estate', 'Developers and agencies', 'Set up with you'].map((t) => (
                <li key={t} className="inline-flex items-center gap-1.5"><Check className="w-4 h-4 text-success" aria-hidden="true" />{t}</li>
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
          <ul className="mt-5 flex flex-wrap justify-center gap-2.5" aria-label="Ready to use">
            {SOURCES.map((s) => (
              <li key={s} className="px-3.5 py-1.5 text-[13px] font-medium bg-white border border-[var(--border)] rounded-full text-[var(--foreground)]">{s}</li>
            ))}
          </ul>
          <p className="mt-5 text-center text-[13px] text-[var(--foreground-muted)]">Connect with your own account — we set these up with you:</p>
          <ul className="mt-3 flex flex-wrap justify-center gap-2.5" aria-label="Connect with your own account">
            {SOURCES_WITH_SETUP.map((s) => (
              <li key={s} className="px-3.5 py-1.5 text-[13px] font-medium bg-[var(--surface-muted)] border border-dashed border-[var(--border-strong)] rounded-full text-[var(--foreground)]">{s}</li>
            ))}
          </ul>
          <p className="mt-3 text-center text-[12px] text-[var(--foreground-subtle)]">Meta, Google and WhatsApp need your business account connected; property portals need API access granted by the portal.</p>
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
            <div key={l.title} className="ceramic lift p-6">
              <span className="w-10 h-10 rounded-xl bg-danger-bg text-danger flex items-center justify-center"><l.icon className="w-5 h-5" aria-hidden="true" /></span>
              <h3 className="mt-4 text-[17px] font-semibold">{l.title}</h3>
              <p className="mt-2 text-[14px] text-[var(--foreground-muted)] leading-relaxed">{l.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" aria-labelledby="how-heading" className="band-ink scroll-mt-16 text-[#fff]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-20">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-[#a5b4fc]">How it works</p>
          <h2 id="how-heading" className="mt-2 text-[30px] sm:text-[36px] font-bold tracking-tight">From form to first call, without anyone forwarding anything</h2>
          <ol className="mt-12 grid gap-6 md:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.n} className="ceramic-dark lift p-6">
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-xl bg-[rgb(99_102_241/0.2)] text-[#c7d2fe] flex items-center justify-center"><s.icon className="w-5 h-5" aria-hidden="true" /></span>
                  <span className="text-[12px] font-mono text-[#94a3b8]">Step {s.n}</span>
                </div>
                <h3 className="mt-4 text-[18px] font-semibold">{s.title}</h3>
                <p className="mt-2 text-[14px] text-[#cbd5e1] leading-relaxed">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Product areas */}
      <section id="features" aria-labelledby="features-heading" className="mx-auto max-w-6xl px-4 sm:px-6 py-20 scroll-mt-16">
        <div className="max-w-2xl">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--brand)]">One platform for the whole sale</p>
          <h2 id="features-heading" className="mt-2 text-[30px] sm:text-[36px] font-bold tracking-tight leading-tight">Fast for salespeople. Clear for managers. Fair for partners.</h2>
        </div>
        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {pagesIn('product').filter((p) => p.path !== '/features').map((p) => (
            <li key={p.path}>
              <Link href={p.path} className="ceramic lift group block h-full p-6">
                <h3 className="text-[17px] font-semibold group-hover:text-[var(--brand)]">{p.label}</h3>
                <p className="mt-1.5 text-[14px] text-[var(--foreground-muted)] leading-relaxed">{p.blurb}</p>
              </Link>
            </li>
          ))}
          <li>
            <Link href="/features" className="flex h-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--border-strong)] p-6 text-[15px] font-semibold text-[var(--brand)] hover:bg-[var(--surface-hover)]">
              See every capability <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </li>
        </ul>
        <div className="mt-14 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title}>
              <span className="w-10 h-10 rounded-xl bg-[var(--brand-light)] text-[var(--brand)] flex items-center justify-center"><f.icon className="w-5 h-5" aria-hidden="true" /></span>
              <h3 className="mt-4 text-[16px] font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-[14px] text-[var(--foreground-muted)] leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Audiences */}
      <section aria-labelledby="audiences-heading" className="mx-auto max-w-6xl px-4 sm:px-6 pb-20">
        <h2 id="audiences-heading" className="sr-only">Who RE is for</h2>
        <div className="grid gap-5 md:grid-cols-2">
          {[
            { href: '/developers', title: 'For developers and builders', body: 'Campaign leads answered, sales teams in control, live inventory by tower and floor, site visits, bookings and the partner network — across every project.', cta: 'RE for developers' },
            { href: '/agencies', title: 'For channel partner agencies', body: 'Your own workspace for buyers and follow-ups, connections with every developer you sell for, shared project inventory and buyer registrations on record.', cta: 'RE for agencies' },
          ].map((x) => (
            <Link key={x.href} href={x.href} className="ceramic lift group p-8">
              <Building2 className="w-7 h-7 text-[var(--brand)]" aria-hidden="true" />
              <h3 className="mt-4 text-[22px] font-bold tracking-tight">{x.title}</h3>
              <p className="mt-2 text-[15px] text-[var(--foreground-muted)] leading-relaxed">{x.body}</p>
              <p className="mt-5 inline-flex items-center gap-2 text-[15px] font-semibold text-[var(--brand)]">{x.cta} <ArrowRight className="w-4 h-4" aria-hidden="true" /></p>
            </Link>
          ))}
        </div>
      </section>

      {/* Moving to RE */}
      <section id="migration" aria-labelledby="migration-heading" className="bg-[var(--background)] border-y border-[var(--border)] scroll-mt-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-20 grid gap-10 md:grid-cols-2 items-center">
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--brand)]">Migration and onboarding</p>
            <h2 id="migration-heading" className="mt-2 text-[30px] font-bold tracking-tight leading-tight">Moving to {PRODUCT_NAME}? Let&rsquo;s make it simple.</h2>
            <p className="mt-4 text-[16px] text-[var(--foreground-muted)] leading-relaxed">
              Coming from another CRM, spreadsheets or WhatsApp groups, we plan the move with you. It starts with an assessment of
              your current system and data, so you know exactly what moves and how before anything changes.
            </p>
            <Link href="/migration" className="mt-6 inline-flex items-center gap-2 text-[15px] font-semibold text-[var(--brand)] hover:underline">
              How migration works <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </div>
          <ul className="space-y-4">
            {[
              ['Assessment first', 'We review your current setup and a sample export, and agree the migration scope in writing.'],
              ['Leads, projects and inventory', 'Leads and contacts imported from your exports; projects and unit inventory set up with you.'],
              ['A guided transition', 'Workflows configured, teams trained, and RE run alongside your current tools until you are ready.'],
            ].map(([t, b]) => (
              <li key={t} className="ceramic flex gap-3 p-5">
                <Check className="w-5 h-5 mt-0.5 text-success flex-shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-[15px] font-semibold">{t}</p>
                  <p className="mt-1 text-[14px] text-[var(--foreground-muted)]">{b}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Plans */}
      <section aria-labelledby="price-heading" className="mx-auto max-w-6xl px-4 sm:px-6 py-20">
        <div className="rounded-3xl band-ink text-[#fff] p-8 md:p-12 grid gap-8 md:grid-cols-[1.3fr_1fr] items-center">
          <div>
            <h2 id="price-heading" className="text-[28px] sm:text-[34px] font-bold tracking-tight leading-tight">Packages for developers and for agencies</h2>
            <p className="mt-3 text-[16px] text-[#c7d2fe] leading-relaxed">
              Separate packages for developer sales teams and channel partner agencies, sized to your team. Tell us about your projects and
              team and we will recommend the right package.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row md:flex-col lg:flex-row gap-3 md:justify-self-end">
            <Link href="/pricing" className="inline-flex items-center justify-center px-5 py-3 text-[15px] font-semibold text-[var(--brand)] bg-[#fff] hover:bg-brand-light rounded-xl transition-colors">
              See packages
            </Link>
            <Link href="/demo?interest=consultation" className="inline-flex items-center justify-center px-5 py-3 text-[15px] font-semibold text-white border border-white/40 hover:bg-white/10 rounded-xl transition-colors">
              Request a consultation
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq-heading" className="mx-auto max-w-3xl px-4 sm:px-6 pb-20">
        <h2 id="faq-heading" className="text-[28px] font-bold tracking-tight text-center">Questions buyers ask us</h2>
        <div className="mt-8 space-y-3">
          {FAQ.map((f) => (
            <details key={f.q} className="ceramic group px-5 py-4 transition-shadow open:[box-shadow:0_0_0_1px_rgb(79_70_229/0.15),0_18px_40px_-12px_rgb(11_17_32/0.12)]">
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
