// app/resources/page.tsx — Resources hub: practical guides for real estate sales teams.
import type { Metadata } from 'next'
import Link from 'next/link'
import { PRODUCT_NAME } from '@/lib/brand'
import { pagesIn } from '@/lib/marketing/site-pages'
import { MarketingShell } from '@/components/marketing/MarketingShell'
import { JsonLd, breadcrumbJsonLd, webPageJsonLd } from '@/components/marketing/JsonLd'

const TITLE = `Resources for real estate sales teams | ${PRODUCT_NAME}`
const DESCRIPTION = 'Practical guides on real estate inventory management, channel partner operations, buyer registration and lead response time for developers and agencies in India.'

export const metadata: Metadata = {
  title: { absolute: TITLE }, description: DESCRIPTION, alternates: { canonical: '/resources' },
  openGraph: { title: TITLE, description: DESCRIPTION, url: '/resources' },
}

export default function ResourcesPage() {
  const guides = pagesIn('resources').filter((p) => p.path !== '/resources')
  return (
    <MarketingShell>
      <JsonLd data={[webPageJsonLd({ path: '/resources', name: TITLE, description: DESCRIPTION }), breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Resources', path: '/resources' }])]} />
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-14 pb-20">
        <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--brand)]">Resources</p>
        <h1 className="mt-3 max-w-3xl text-[34px] sm:text-[44px] leading-[1.1] font-extrabold tracking-tight">Practical guides for real estate sales teams</h1>
        <p className="mt-4 max-w-2xl text-[17px] text-muted leading-relaxed">Written for developers, sales managers and channel partner agencies in India: how to run inventory, partners and lead response well — with or without {PRODUCT_NAME}.</p>
        <ul className="mt-12 grid gap-5 md:grid-cols-3">
          {guides.map((g) => (
            <li key={g.path}>
              <Link href={g.path} className="group block h-full rounded-2xl border border-[var(--border)] bg-surface p-6 hover:border-[var(--brand)] transition-colors">
                <h2 className="text-[18px] font-semibold leading-snug group-hover:text-[var(--brand)]">{g.label.replace(/^Guide: (.)/, (_, c: string) => c.toUpperCase())}</h2>
                <p className="mt-2 text-[14px] text-muted leading-relaxed">{g.blurb}</p>
                <p className="mt-4 text-[14px] font-semibold text-[var(--brand)]">Read the guide</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </MarketingShell>
  )
}
