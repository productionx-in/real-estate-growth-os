// components/marketing/ArticlePage.tsx — long-form guides under /resources. Article + BreadcrumbList structured data,
// a visible "last updated" date, a short answer up front (for readers and answer engines), and links to the product
// areas the guide relates to.
import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { PRODUCT_NAME } from '@/lib/brand'
import { MarketingShell } from './MarketingShell'
import { JsonLd, articleJsonLd, breadcrumbJsonLd, webPageJsonLd } from './JsonLd'

export interface ArticleContent {
  path: string
  title: string
  description: string
  datePublished: string
  /** The short answer, shown first. */
  summary: string
  sections: { heading: string; paragraphs?: string[]; list?: string[] }[]
  related: { href: string; label: string }[]
}

export function articleMetadata(a: ArticleContent): Metadata {
  return {
    title: { absolute: `${a.title} | ${PRODUCT_NAME}` },
    description: a.description,
    alternates: { canonical: a.path },
    openGraph: { title: a.title, description: a.description, url: a.path, type: 'article', publishedTime: a.datePublished },
  }
}

export function ArticlePage({ a }: { a: ArticleContent }) {
  const date = new Date(`${a.datePublished}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
  return (
    <MarketingShell>
      <JsonLd data={[
        webPageJsonLd({ path: a.path, name: a.title, description: a.description }),
        articleJsonLd({ path: a.path, headline: a.title, description: a.description, datePublished: a.datePublished }),
        breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Resources', path: '/resources' }, { name: a.title, path: a.path }]),
      ]} />
      <article className="mx-auto max-w-3xl px-4 sm:px-6 pt-8 pb-16">
        <nav aria-label="Breadcrumb" className="text-[13px] text-subtle">
          <ol className="flex flex-wrap items-center gap-1">
            <li><Link href="/" className="hover:text-foreground">Home</Link></li>
            <li aria-hidden="true"><ChevronRight className="w-3.5 h-3.5" /></li>
            <li><Link href="/resources" className="hover:text-foreground">Resources</Link></li>
          </ol>
        </nav>
        <h1 className="mt-8 text-[32px] sm:text-[40px] leading-[1.12] font-extrabold tracking-tight">{a.title}</h1>
        <p className="mt-3 text-[13px] text-subtle">By the {PRODUCT_NAME} team · Updated <time dateTime={a.datePublished}>{date}</time></p>
        <div className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-6">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--brand)]">In short</p>
          <p className="mt-2 text-[16px] leading-relaxed">{a.summary}</p>
        </div>
        {a.sections.map((s) => (
          <section key={s.heading} className="mt-10">
            <h2 className="text-[24px] font-bold tracking-tight leading-tight">{s.heading}</h2>
            {s.paragraphs?.map((p) => <p key={p.slice(0, 40)} className="mt-4 text-[16px] text-muted leading-[1.75]">{p}</p>)}
            {s.list && (
              <ul className="mt-4 list-disc pl-6 space-y-2 text-[16px] text-muted leading-relaxed">
                {s.list.map((li) => <li key={li.slice(0, 40)}>{li}</li>)}
              </ul>
            )}
          </section>
        ))}
        <aside aria-labelledby="related-heading" className="mt-14 border-t border-[var(--border)] pt-8">
          <h2 id="related-heading" className="text-[18px] font-bold">How {PRODUCT_NAME} helps</h2>
          <ul className="mt-4 space-y-2">
            {a.related.map((r) => <li key={r.href}><Link href={r.href} className="text-[15px] font-semibold text-[var(--brand)] hover:underline">{r.label}</Link></li>)}
          </ul>
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <Link href="/demo" className="inline-flex items-center justify-center px-5 py-3 text-[15px] font-semibold text-brand-foreground bg-brand hover:bg-brand-hover rounded-xl">Book a demo</Link>
            <Link href="/demo?interest=consultation" className="inline-flex items-center justify-center px-5 py-3 text-[15px] font-semibold bg-surface border border-[var(--border-strong)] hover:bg-surface-hover rounded-xl">Request a consultation</Link>
          </div>
        </aside>
      </article>
    </MarketingShell>
  )
}
