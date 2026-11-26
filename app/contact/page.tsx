// app/contact/page.tsx — Contact. Ways to reach RE by PX that work today (the contact form, which reaches the sales team
// as a lead; Help & support for customers), plus company particulars from lib/legal.ts — shown as marked placeholders
// until Production X supplies them. Not indexed until those particulars are confirmed.
import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarCheck, LifeBuoy, Mail, ShieldCheck } from 'lucide-react'
import { MarketingShell } from '@/components/marketing/MarketingShell'
import { DemoRequestForm } from '@/components/marketing/DemoRequestForm'
import { JsonLd, breadcrumbJsonLd, webPageJsonLd } from '@/components/marketing/JsonLd'
import { ContactLine, Pending } from '@/components/legal/LegalPage'
import { LEGAL, legalEntity } from '@/lib/legal'

const TITLE = `Contact ${LEGAL.product}`
const DESCRIPTION = `Contact the ${LEGAL.product} team: book a demo, ask about migration or packages, get customer support, or reach us about privacy and grievances.`

export const metadata: Metadata = {
  title: { absolute: `${TITLE} | ${LEGAL.product}` },
  description: DESCRIPTION,
  robots: LEGAL.confirmed ? undefined : { index: false, follow: true },
  alternates: { canonical: '/contact' },
}

export const dynamic = 'force-dynamic'

export default function ContactPage() {
  return (
    <MarketingShell>
      <JsonLd data={[webPageJsonLd({ path: '/contact', name: TITLE, description: DESCRIPTION }), breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Contact', path: '/contact' }])]} />
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-14 grid gap-12 lg:grid-cols-[1fr_1.15fr]">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--brand)]">Contact</p>
          <h1 className="mt-2 text-[34px] sm:text-[40px] font-extrabold tracking-tight leading-tight">Talk to the {LEGAL.product} team</h1>
          <p className="mt-4 text-[16px] text-muted leading-relaxed">Send us a message and we will call you back. Customers can also reach support from inside their workspace.</p>
          <ul className="mt-8 space-y-6 text-[15px]">
            <li className="flex gap-4">
              <CalendarCheck className="w-6 h-6 text-[var(--brand)] flex-shrink-0" aria-hidden="true" />
              <div><p className="font-semibold">Sales and demos</p><p className="text-muted">Use the form, or <Link href="/demo" className="text-[var(--brand)] hover:underline">book a demo</Link>. Email: <ContactLine email={LEGAL.salesEmail} what="sales email" /></p></div>
            </li>
            <li className="flex gap-4">
              <LifeBuoy className="w-6 h-6 text-[var(--brand)] flex-shrink-0" aria-hidden="true" />
              <div><p className="font-semibold">Customer support</p><p className="text-muted">Signed-in customers: open <strong>Help &amp; support</strong> in your workspace. Email: <ContactLine email={LEGAL.supportEmail} what="support email" /></p></div>
            </li>
            <li className="flex gap-4">
              <ShieldCheck className="w-6 h-6 text-[var(--brand)] flex-shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold">Privacy and grievances</p>
                <p className="text-muted">Privacy requests: <ContactLine email={LEGAL.privacyEmail} what="privacy email" />. Grievance officer: {LEGAL.grievanceOfficer ? <>{LEGAL.grievanceOfficer.name}, <ContactLine email={LEGAL.grievanceOfficer.email} /></> : <Pending what="grievance officer name and email" />}. See our <Link href="/privacy" className="text-[var(--brand)] hover:underline">Privacy Policy</Link>.</p>
              </div>
            </li>
            <li className="flex gap-4">
              <Mail className="w-6 h-6 text-[var(--brand)] flex-shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold">Company</p>
                <p className="text-muted">
                  {legalEntity()}{LEGAL.legalName ? '' : <> (<Pending what="registered legal name" />)</>}<br />
                  Registered office: {LEGAL.registeredAddress ?? <Pending what="registered office address" />}<br />
                  Phone: {LEGAL.phone ?? <Pending what="phone number" />}{LEGAL.cin ? <><br />CIN: {LEGAL.cin}</> : null}
                </p>
              </div>
            </li>
          </ul>
        </div>
        <div className="rounded-3xl border border-[var(--border)] bg-surface p-6 sm:p-8 shadow-sm">
          <h2 className="text-[20px] font-bold">Send us a message</h2>
          <div className="mt-5"><DemoRequestForm initialPlan="leads" initialInterest="contact" connectionId={process.env.REGROW_DEMO_FORM_CONNECTION_ID?.trim() || null} /></div>
        </div>
      </section>
    </MarketingShell>
  )
}
