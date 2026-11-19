// components/marketing/ProductPage.tsx — one template for every product, audience and solution page, so structure,
// headings, structured data, breadcrumbs, calls to action and capability labels are consistent across the site.
// Capability cards come from the capability register (lib/marketing/capabilities.ts): a capability that needs the
// customer's own setup, or is only partly built, is labelled — the page cannot claim more than the register allows.
import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Check, ChevronRight } from 'lucide-react'
import { PRODUCT_NAME } from '@/lib/brand'
import { publicCapability, statusLabel, type CapabilityId } from '@/lib/marketing/capabilities'
import { MarketingShell } from './MarketingShell'
import { JsonLd, breadcrumbJsonLd, webPageJsonLd } from './JsonLd'

export interface ProductPageContent {
  path: string
  /** <title>, without the brand suffix (the brand is appended). */
  metaTitle: string
  metaDescription: string
  breadcrumb: string
  eyebrow: string
  h1: string
  intro: string
  /** AEO: a direct, quotable answer to the page's core question ("What is …?"). */
  definition?: { question: string; answer: string }
  primaryCta?: { label: string; href: string }
  secondaryCta?: { label: string; href: string }
  /** Problem → outcome statements for the audience. */
  outcomes?: { title: string; body: string }[]
  /** How the workflow runs, step by step. */
  workflow?: { heading: string; intro?: string; steps: { title: string; body: string }[] }
  capabilityGroups?: { heading: string; ids: CapabilityId[] }[]
  /** Free-form explanatory sections (h2 + paragraphs). */
  sections?: { heading: string; paragraphs: string[] }[]
  faq?: { q: string; a: string }[]
  related?: { href: string; label: string; body: string }[]
  closing?: { heading: string; body: string }
}

export function productMetadata(c: ProductPageContent): Metadata {
  const title = `${c.metaTitle} | ${PRODUCT_NAME}`
  return {
    title: { absolute: title },
    description: c.metaDescription,
    alternates: { canonical: c.path },
    openGraph: { title, description: c.metaDescription, url: c.path, type: 'website' },
  }
}

const btnPrimary = 'inline-flex items-center justify-center gap-2 px-5 py-3 text-[15px] font-semibold text-brand-foreground bg-brand hover:bg-brand-hover rounded-xl shadow-sm transition-colors'
const btnSecondary = 'inline-flex items-center justify-center px-5 py-3 text-[15px] font-semibold text-foreground bg-surface border border-[var(--border-strong)] hover:bg-surface-hover rounded-xl transition-colors'

export function ProductPage({ c }: { c: ProductPageContent }) {
  const primary = c.primaryCta ?? { label: 'Book a demo', href: '/demo' }
  const secondary = c.secondaryCta ?? { label: 'Request a consultation', href: '/demo?interest=consultation' }
  return (
    <MarketingShell>
      <JsonLd data={[
        webPageJsonLd({ path: c.path, name: c.metaTitle, description: c.metaDescription }),
        breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: c.breadcrumb, path: c.path }]),
      ]} />

      <section className="border-b border-[var(--border)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-8 pb-16 md:pb-20">
          <nav aria-label="Breadcrumb" className="text-[13px] text-subtle">
            <ol className="flex items-center gap-1">
              <li><Link href="/" className="hover:text-foreground">Home</Link></li>
              <li aria-hidden="true"><ChevronRight className="w-3.5 h-3.5" /></li>
              <li aria-current="page" className="text-muted">{c.breadcrumb}</li>
            </ol>
          </nav>
          <p className="mt-10 text-[13px] font-semibold uppercase tracking-wider text-[var(--brand)]">{c.eyebrow}</p>
          <h1 className="mt-3 max-w-4xl text-[34px] sm:text-[46px] leading-[1.08] font-extrabold tracking-tight">{c.h1}</h1>
          <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-muted">{c.intro}</p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <Link href={primary.href} className={btnPrimary}>{primary.label} <ArrowRight className="w-4 h-4" aria-hidden="true" /></Link>
            <Link href={secondary.href} className={btnSecondary}>{secondary.label}</Link>
          </div>
        </div>
      </section>

      {c.definition && (
        <section aria-labelledby="definition-heading" className="mx-auto max-w-6xl px-4 sm:px-6 pt-16">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-6 sm:p-8 max-w-4xl">
            <h2 id="definition-heading" className="text-[20px] font-bold tracking-tight">{c.definition.question}</h2>
            <p className="mt-3 text-[16px] leading-relaxed text-foreground">{c.definition.answer}</p>
          </div>
        </section>
      )}

      {c.outcomes && (
        <section aria-labelledby="outcomes-heading" className="mx-auto max-w-6xl px-4 sm:px-6 py-16">
          <h2 id="outcomes-heading" className="text-[28px] sm:text-[32px] font-bold tracking-tight leading-tight max-w-3xl">What changes for your team</h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {c.outcomes.map((o) => (
              <div key={o.title} className="rounded-2xl border border-[var(--border)] bg-surface p-6">
                <h3 className="text-[17px] font-semibold">{o.title}</h3>
                <p className="mt-2 text-[14px] text-muted leading-relaxed">{o.body}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {c.workflow && (
        <section aria-labelledby="workflow-heading" className="bg-[var(--background)] border-y border-[var(--border)]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16">
            <h2 id="workflow-heading" className="text-[28px] sm:text-[32px] font-bold tracking-tight leading-tight max-w-3xl">{c.workflow.heading}</h2>
            {c.workflow.intro && <p className="mt-3 max-w-2xl text-[16px] text-muted leading-relaxed">{c.workflow.intro}</p>}
            <ol className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {c.workflow.steps.map((s, i) => (
                <li key={s.title} className="rounded-2xl border border-[var(--border)] bg-surface p-6">
                  <span className="text-[12px] font-mono text-subtle">Step {i + 1}</span>
                  <h3 className="mt-2 text-[17px] font-semibold">{s.title}</h3>
                  <p className="mt-2 text-[14px] text-muted leading-relaxed">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {c.capabilityGroups && (
        <section aria-labelledby="capabilities-heading" className="mx-auto max-w-6xl px-4 sm:px-6 py-16">
          <h2 id="capabilities-heading" className="text-[28px] sm:text-[32px] font-bold tracking-tight leading-tight">What {PRODUCT_NAME} gives you</h2>
          <div className="mt-8 space-y-10">
            {c.capabilityGroups.map((g) => (
              <div key={g.heading}>
                <h3 className="text-[18px] font-semibold">{g.heading}</h3>
                <ul className="mt-4 grid gap-4 sm:grid-cols-2">
                  {g.ids.map((id) => {
                    const cap = publicCapability(id)
                    const label = statusLabel(cap.status)
                    return (
                      <li key={id} className="flex gap-3 rounded-xl border border-[var(--border)] bg-surface p-4">
                        <Check className="w-5 h-5 mt-0.5 text-success flex-shrink-0" aria-hidden="true" />
                        <div>
                          <p className="text-[15px] font-semibold">
                            {cap.name}
                            {label && <span className="ml-2 align-middle text-[11px] font-semibold uppercase tracking-wide text-warning-foreground bg-warning-bg rounded px-1.5 py-px">{label}</span>}
                          </p>
                          <p className="mt-1 text-[14px] text-muted leading-relaxed">{cap.summary}</p>
                          {cap.publicNote && <p className="mt-1 text-[13px] text-subtle">{cap.publicNote}</p>}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      {c.sections?.map((s, i) => (
        <section key={s.heading} aria-labelledby={`section-${i}`} className="mx-auto max-w-3xl px-4 sm:px-6 py-10">
          <h2 id={`section-${i}`} className="text-[24px] sm:text-[28px] font-bold tracking-tight leading-tight">{s.heading}</h2>
          {s.paragraphs.map((p) => <p key={p.slice(0, 40)} className="mt-4 text-[16px] text-muted leading-relaxed">{p}</p>)}
        </section>
      ))}

      {c.faq && (
        <section aria-labelledby="faq-heading" className="mx-auto max-w-3xl px-4 sm:px-6 py-16">
          <h2 id="faq-heading" className="text-[28px] font-bold tracking-tight text-center">Frequently asked questions</h2>
          <div className="mt-8 divide-y divide-[var(--border)] border-y border-[var(--border)]">
            {c.faq.map((f) => (
              <details key={f.q} className="group py-4">
                <summary className="flex items-center justify-between cursor-pointer list-none text-[16px] font-semibold">
                  <h3 className="text-[16px] font-semibold">{f.q}</h3>
                  <span className="ml-4 text-subtle group-open:rotate-45 transition-transform text-[20px] leading-none" aria-hidden="true">+</span>
                </summary>
                <p className="mt-2 text-[15px] text-muted leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {c.related && (
        <section aria-labelledby="related-heading" className="mx-auto max-w-6xl px-4 sm:px-6 pb-16">
          <h2 id="related-heading" className="text-[22px] font-bold tracking-tight">Related</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {c.related.map((r) => (
              <li key={r.href}>
                <Link href={r.href} className="group block h-full rounded-2xl border border-[var(--border)] bg-surface p-5 hover:border-[var(--brand)] transition-colors">
                  <p className="text-[15px] font-semibold group-hover:text-[var(--brand)]">{r.label}</p>
                  <p className="mt-1 text-[14px] text-muted leading-relaxed">{r.body}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="closing-heading" className="mx-auto max-w-6xl px-4 sm:px-6 pb-20">
        <div className="rounded-3xl bg-[var(--brand-light)] border border-[var(--border)] p-8 md:p-12 grid gap-8 md:grid-cols-[1.4fr_1fr] items-center">
          <div>
            <h2 id="closing-heading" className="text-[26px] sm:text-[30px] font-bold tracking-tight leading-tight">{c.closing?.heading ?? `See ${PRODUCT_NAME} on your own projects`}</h2>
            <p className="mt-3 text-[15px] text-muted leading-relaxed">{c.closing?.body ?? 'We set up the demo around your projects, teams and lead sources, and answer what matters to you — including what REGrow does not do.'}</p>
          </div>
          <div className="flex flex-col gap-3">
            <Link href="/demo" className={btnPrimary}>Book a demo</Link>
            <Link href="/migration" className={btnSecondary}>Request a migration assessment</Link>
            <Link href="/contact" className="text-center text-[14px] font-semibold text-[var(--brand)] hover:underline">Contact the team</Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  )
}
