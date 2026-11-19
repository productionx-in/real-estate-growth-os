// app/features/page.tsx — Platform overview: the hub that links every product area (topical map for search and AI).
import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { PRODUCT_DESCRIPTOR, PRODUCT_NAME } from '@/lib/brand'
import { CAPABILITIES, statusLabel, type CapabilityStatus } from '@/lib/marketing/capabilities'
import { pagesIn } from '@/lib/marketing/site-pages'
import { MarketingShell } from '@/components/marketing/MarketingShell'
import { JsonLd, breadcrumbJsonLd, webPageJsonLd } from '@/components/marketing/JsonLd'

const TITLE = `${PRODUCT_NAME} platform overview: CRM, inventory and channel partner software`
const DESCRIPTION = `${PRODUCT_NAME} is a ${PRODUCT_DESCRIPTOR.toLowerCase()}: lead management, sales teams, projects and inventory, site visits, bookings, channel partners and analytics for developers and agencies.`

export const metadata: Metadata = {
  title: { absolute: TITLE }, description: DESCRIPTION, alternates: { canonical: '/features' },
  openGraph: { title: TITLE, description: DESCRIPTION, url: '/features' },
}

const SHOWN: CapabilityStatus[] = ['in_production', 'available', 'needs_setup', 'partial']

export default function FeaturesPage() {
  const caps = Object.values(CAPABILITIES).filter((c) => SHOWN.includes(c.status))
  return (
    <MarketingShell>
      <JsonLd data={[webPageJsonLd({ path: '/features', name: TITLE, description: DESCRIPTION }), breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Platform overview', path: '/features' }])]} />
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-14 pb-12">
        <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--brand)]">Platform overview</p>
        <h1 className="mt-3 max-w-4xl text-[34px] sm:text-[46px] leading-[1.08] font-extrabold tracking-tight">The {PRODUCT_DESCRIPTOR} for developers and channel partner agencies</h1>
        <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-muted">
          {PRODUCT_NAME} connects lead management, sales teams, projects and property inventory, site visits, bookings and channel partner
          workflows in one platform, so every part of a real estate sale works from the same records.
        </p>
      </section>

      <section aria-labelledby="areas-heading" className="mx-auto max-w-6xl px-4 sm:px-6 pb-16">
        <h2 id="areas-heading" className="text-[26px] font-bold tracking-tight">Product areas</h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...pagesIn('product').filter((p) => p.path !== '/features'), ...pagesIn('solutions')].map((p) => (
            <li key={p.path}>
              <Link href={p.path} className="group block h-full rounded-2xl border border-[var(--border)] bg-surface p-5 hover:border-[var(--brand)] transition-colors">
                <p className="text-[16px] font-semibold group-hover:text-[var(--brand)] inline-flex items-center gap-1.5">{p.label} <ArrowRight className="w-4 h-4" aria-hidden="true" /></p>
                <p className="mt-1 text-[14px] text-muted leading-relaxed">{p.blurb}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="all-heading" className="bg-[var(--background)] border-y border-[var(--border)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16">
          <h2 id="all-heading" className="text-[26px] font-bold tracking-tight">Every capability, and what it needs</h2>
          <p className="mt-3 max-w-2xl text-[15px] text-muted">Capabilities marked “Needs your account connected” work after you authorise your own Meta, Google, WhatsApp or portal account. “Partial” means only the part described is available.</p>
          <dl className="mt-8 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            {caps.map((cap) => {
              const label = statusLabel(cap.status)
              return (
                <div key={cap.id}>
                  <dt className="text-[15px] font-semibold">{cap.name}{label && <span className="ml-2 align-middle text-[11px] font-semibold uppercase tracking-wide text-warning-foreground bg-warning-bg rounded px-1.5 py-px">{label}</span>}</dt>
                  <dd className="mt-1 text-[14px] text-muted leading-relaxed">{cap.summary}{'publicNote' in cap && cap.publicNote ? ` ${cap.publicNote}` : ''}</dd>
                </div>
              )
            })}
          </dl>
          <p className="mt-10 text-[14px] text-muted">Not available today: single sign-on, native iOS and Android apps (REGrow is an installable web app), and a built-in dialer.</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-16 flex flex-col sm:flex-row gap-3">
        <Link href="/demo" className="inline-flex items-center justify-center gap-2 px-5 py-3 text-[15px] font-semibold text-brand-foreground bg-brand hover:bg-brand-hover rounded-xl">Book a demo <ArrowRight className="w-4 h-4" aria-hidden="true" /></Link>
        <Link href="/demo?interest=consultation" className="inline-flex items-center justify-center px-5 py-3 text-[15px] font-semibold bg-surface border border-[var(--border-strong)] hover:bg-surface-hover rounded-xl">Request a consultation</Link>
      </section>
    </MarketingShell>
  )
}
