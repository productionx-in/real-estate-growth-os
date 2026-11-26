// app/migration/page.tsx — Moving to RE by PX: assessment-led migration and onboarding. Deliberately names no other
// product: the scope of every migration is agreed after we look at the customer's own system and data.
import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowRight, Building2, ClipboardCheck, FileSpreadsheet, GraduationCap, LifeBuoy, Route, SearchCheck, Users,
} from 'lucide-react'
import { PRODUCT_NAME } from '@/lib/brand'
import { MarketingShell } from '@/components/marketing/MarketingShell'
import { JsonLd, breadcrumbJsonLd, webPageJsonLd } from '@/components/marketing/JsonLd'

const TITLE = `Moving to ${PRODUCT_NAME} — CRM migration and onboarding for real estate teams`
const DESCRIPTION =
  'Moving to RE by PX from another CRM or spreadsheets? We assess your system and data, then plan lead import, inventory setup, workflows and team onboarding with you.'

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: '/migration' },
  openGraph: { title: TITLE, description: DESCRIPTION, url: '/migration' },
}

const STEPS = [
  {
    icon: SearchCheck, title: 'Assessment of your current setup',
    body: 'We look at the system you use today, the exports it can produce, your lead sources, projects and how your teams work. You get a written migration scope: what moves, how, and what needs a decision from you.',
  },
  {
    icon: FileSpreadsheet, title: 'Leads and contacts',
    body: 'Leads and buyer contacts are imported from CSV or Excel exports. Name, phone, email, source, stage, salesperson, project and enquiry date are mapped to RE by PX fields; duplicates are matched on phone number. We review a sample with you before the full import.',
  },
  {
    icon: Building2, title: 'Projects and property inventory',
    body: 'Your projects are set up with their towers, floors and units, unit configurations and availability, so sales and channel partner teams work from one current inventory.',
  },
  {
    icon: Route, title: 'Sales workflows',
    body: 'Lead stages, routing rules by project, source or campaign, fair rotation between salespeople, follow-up reminders and escalation are configured to match how your teams sell.',
  },
  {
    icon: Users, title: 'Team onboarding',
    body: 'Salespeople, managers and admins are invited with the right roles, so each person sees what they should — and managers see their whole team.',
  },
  {
    icon: GraduationCap, title: 'Training and guided transition',
    body: 'Role-based walkthroughs for salespeople and managers, and support through the first weeks. Teams can run RE by PX alongside their current tools during the transition, so nothing is switched off before you are ready.',
  },
]

const SCOPE = [
  ['What we can usually move', 'Leads and contacts with their source, stage, owner and dates; projects; unit inventory from a structured sheet; team members and roles.'],
  ['What depends on your current system', 'Activity history, notes, documents and custom fields depend on what your current system can export and in what format. We confirm this in the assessment.'],
  ['What we set up fresh', 'Routing rules, follow-up rules, notifications and lead-source connections are configured in RE by PX rather than copied, so they work the way RE by PX works.'],
]

const FAQ = [
  {
    q: 'Can RE by PX import data from our current CRM?',
    a: 'In most cases, yes — through a CSV or Excel export of your leads and contacts. What can be moved depends on what your current system can export. We review a sample export during the assessment and confirm the scope before anything is imported.',
  },
  {
    q: 'Is migration automatic?',
    a: 'No. Every migration is planned: we assess your data, agree a field mapping with you, import a sample, check it together and only then import the rest. This avoids duplicate or misassigned leads.',
  },
  {
    q: 'Do we have to stop using our current system on day one?',
    a: 'No. Many teams run RE by PX alongside their current tools for a period — for example, for new leads first — and complete the move once their teams are comfortable.',
  },
  {
    q: 'Can our project and unit inventory be set up for us?',
    a: 'Yes. Share your inventory in a structured sheet (towers, floors, units, configurations and status) and we set it up with you during onboarding.',
  },
  {
    q: 'What does a migration assessment involve?',
    a: 'A conversation about your current setup and a look at a sample export. You receive a written scope covering data, projects and inventory, workflows and team onboarding, with any open decisions listed.',
  },
]

export default function MigrationPage() {
  return (
    <MarketingShell>
      <JsonLd data={[
        webPageJsonLd({ path: '/migration', name: TITLE, description: DESCRIPTION }),
        breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Migration and onboarding', path: '/migration' }]),
      ]} />

      <section className="relative overflow-hidden border-b border-[var(--border)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-14 pb-16 md:pt-20 md:pb-20">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--brand)]">Migration and onboarding</p>
          <h1 className="mt-3 max-w-3xl text-[36px] sm:text-[46px] leading-[1.08] font-extrabold tracking-tight">
            Moving to {PRODUCT_NAME}? Let&rsquo;s make it simple.
          </h1>
          <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-muted">
            Whether your team works in another CRM, in spreadsheets or across WhatsApp groups, we plan the move with you: your leads
            and contacts, your projects and inventory, your sales workflows and your people. Every migration starts with an
            assessment of your current system and data, so the scope is clear before anything moves.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <Link href="/demo?interest=migration" className="inline-flex items-center justify-center gap-2 px-5 py-3 text-[15px] font-semibold text-brand-foreground bg-brand hover:bg-brand-hover rounded-xl shadow-sm transition-colors">
              Request a migration assessment <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
            <Link href="/demo" className="inline-flex items-center justify-center px-5 py-3 text-[15px] font-semibold text-foreground bg-surface border border-[var(--border-strong)] hover:bg-surface-hover rounded-xl transition-colors">
              Book a demo first
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="steps-heading" className="mx-auto max-w-6xl px-4 sm:px-6 py-20">
        <div className="max-w-2xl">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--brand)]">How a move to {PRODUCT_NAME} works</p>
          <h2 id="steps-heading" className="mt-2 text-[30px] sm:text-[34px] font-bold tracking-tight leading-tight">Six steps, planned around your teams</h2>
        </div>
        <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-2xl border border-[var(--border)] bg-surface p-6">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-[var(--brand-light)] text-[var(--brand)] flex items-center justify-center"><s.icon className="w-5 h-5" aria-hidden="true" /></span>
                <span className="text-[12px] font-mono text-subtle">Step {i + 1}</span>
              </div>
              <h3 className="mt-4 text-[17px] font-semibold">{s.title}</h3>
              <p className="mt-2 text-[14px] text-muted leading-relaxed">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="scope-heading" className="bg-[var(--background)] border-y border-[var(--border)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-20 grid gap-10 md:grid-cols-[1fr_1.4fr]">
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--brand)]">Migration scope</p>
            <h2 id="scope-heading" className="mt-2 text-[28px] font-bold tracking-tight leading-tight">Clear about what moves, and how</h2>
            <p className="mt-4 text-[15px] text-muted leading-relaxed">
              Every source system and every dataset is different. Compatibility and scope are confirmed in the assessment, based on
              your system and a sample of your data — not assumed in advance.
            </p>
          </div>
          <dl className="space-y-4">
            {SCOPE.map(([t, b]) => (
              <div key={t} className="rounded-2xl border border-[var(--border)] bg-surface p-5">
                <dt className="flex items-center gap-2 text-[15px] font-semibold"><ClipboardCheck className="w-4 h-4 text-[var(--brand)]" aria-hidden="true" />{t}</dt>
                <dd className="mt-1.5 text-[14px] text-muted leading-relaxed">{b}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section aria-labelledby="support-heading" className="mx-auto max-w-6xl px-4 sm:px-6 py-20">
        <div className="rounded-3xl bg-[var(--brand-light)] border border-[var(--border)] p-8 md:p-12 grid gap-8 md:grid-cols-[1.4fr_1fr] items-center">
          <div>
            <LifeBuoy className="w-8 h-8 text-[var(--brand)]" aria-hidden="true" />
            <h2 id="support-heading" className="mt-3 text-[26px] sm:text-[30px] font-bold tracking-tight leading-tight">Implementation support from people who know real estate sales</h2>
            <p className="mt-3 text-[15px] text-muted leading-relaxed">
              Developers and channel partner agencies work differently. We configure {PRODUCT_NAME} around your projects, your teams
              and your partner relationships, and stay with you through the first weeks.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Link href="/demo?interest=migration" className="inline-flex items-center justify-center gap-2 px-5 py-3 text-[15px] font-semibold text-brand-foreground bg-brand hover:bg-brand-hover rounded-xl transition-colors">
              Request a migration assessment
            </Link>
            <Link href="/contact" className="inline-flex items-center justify-center px-5 py-3 text-[15px] font-semibold text-foreground bg-surface border border-[var(--border-strong)] hover:bg-surface-hover rounded-xl transition-colors">
              Talk to the team
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="faq-heading" className="mx-auto max-w-3xl px-4 sm:px-6 pb-20">
        <h2 id="faq-heading" className="text-[28px] font-bold tracking-tight text-center">Migration questions</h2>
        <div className="mt-8 divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {FAQ.map((f) => (
            <details key={f.q} className="group py-4">
              <summary className="flex items-center justify-between cursor-pointer list-none text-[16px] font-semibold">
                {f.q}
                <span className="ml-4 text-subtle group-open:rotate-45 transition-transform text-[20px] leading-none" aria-hidden="true">+</span>
              </summary>
              <p className="mt-2 text-[15px] text-muted leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </MarketingShell>
  )
}
