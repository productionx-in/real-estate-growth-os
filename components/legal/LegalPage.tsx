// components/legal/LegalPage.tsx — shared layout for the legal pages: a contents list with anchors, readable line
// length, and a notice while the text is being finalised (lib/legal.ts). Unknown facts render as <Pending>, a visibly
// marked placeholder — never as invented values.
import Link from 'next/link'
import { MarketingShell } from '@/components/marketing/MarketingShell'
import { LEGAL, legalEntity } from '@/lib/legal'

export interface LegalSection { id: string; title: string; body: React.ReactNode }

export function LegalPage({ title, intro, sections }: { title: string; intro: React.ReactNode; sections: LegalSection[] }) {
  return (
    <MarketingShell>
      <article className="mx-auto max-w-3xl px-4 sm:px-6 py-14">
        <h1 className="text-[32px] font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-[14px] text-[var(--foreground-muted)]">Last updated {LEGAL.lastUpdated} · {legalEntity()}</p>
        {!LEGAL.confirmed && (
          <p role="note" className="mt-5 rounded-xl border border-[var(--warning)]/30 bg-[var(--warning-bg)] px-4 py-3 text-[14px] text-[var(--warning)]">
            Draft — this document is being finalised. Items marked “to be confirmed” will be completed before it takes effect.
          </p>
        )}
        <div className="mt-6 text-[16px] leading-relaxed text-[var(--foreground)]">{intro}</div>
        <nav aria-label="Contents" className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-5">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--foreground-subtle)]">Contents</p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-[15px]">
            {sections.map((s) => <li key={s.id}><a className="text-[var(--brand)] hover:underline" href={`#${s.id}`}>{s.title}</a></li>)}
          </ol>
        </nav>
        {sections.map((s, i) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="mt-10 scroll-mt-24">
            <h2 id={`${s.id}-h`} className="text-[22px] font-semibold tracking-tight">{i + 1}. {s.title}</h2>
            <div className="mt-3 space-y-3 text-[16px] leading-relaxed text-[var(--foreground)] [&_li]:ml-5 [&_ul]:list-disc [&_ul]:space-y-1.5">{s.body}</div>
          </section>
        ))}
        <nav aria-label="Related policies" className="mt-14 border-t border-[var(--border)] pt-6 text-[14px] flex flex-wrap gap-x-5 gap-y-2">
          <Link className="text-[var(--brand)] hover:underline" href="/privacy">Privacy Policy</Link>
          <Link className="text-[var(--brand)] hover:underline" href="/terms">Terms of Service</Link>
          <Link className="text-[var(--brand)] hover:underline" href="/refund-policy">Refund &amp; Cancellation Policy</Link>
          <Link className="text-[var(--brand)] hover:underline" href="/contact">Contact</Link>
        </nav>
      </article>
    </MarketingShell>
  )
}

/** A fact Production X has not supplied yet: shown as a marked placeholder, never guessed. */
export function Pending({ what }: { what: string }) {
  return <mark className="rounded bg-[var(--warning-bg)] px-1 text-[var(--warning)]">[to be confirmed: {what}]</mark>
}

/** An email link when known, otherwise a marked placeholder. */
export function ContactLine({ email, what = 'contact email' }: { email: string | null; what?: string }) {
  return email ? <a className="text-[var(--brand)] hover:underline" href={`mailto:${email}`}>{email}</a> : <Pending what={what} />
}
