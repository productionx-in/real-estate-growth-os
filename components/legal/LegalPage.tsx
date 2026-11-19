// components/legal/LegalPage.tsx — shared layout for the Privacy Policy and Terms: a contents list with anchors,
// readable line length, and a notice while the text is being finalised (lib/legal.ts).
import { MarketingShell } from '@/components/marketing/MarketingShell'
import { LEGAL } from '@/lib/legal'

export interface LegalSection { id: string; title: string; body: React.ReactNode }

export function LegalPage({ title, intro, sections }: { title: string; intro: React.ReactNode; sections: LegalSection[] }) {
  return (
    <MarketingShell>
      <article className="mx-auto max-w-3xl px-4 sm:px-6 py-14">
        <h1 className="text-[32px] font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-[14px] text-[var(--foreground-muted)]">Last updated {LEGAL.lastUpdated} · {LEGAL.entity}</p>
        {!LEGAL.confirmed && (
          <p role="note" className="mt-5 rounded-xl border border-[var(--warning)]/30 bg-[var(--warning-bg)] px-4 py-3 text-[14px] text-[var(--warning)]">
            This document is being finalised. Contact details and a few company particulars will be added shortly.
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
      </article>
    </MarketingShell>
  )
}

/** "privacy@…" when confirmed, otherwise a pointer that still works today. */
export function ContactLine({ email }: { email: string | null }) {
  return email ? <a className="text-[var(--brand)] hover:underline" href={`mailto:${email}`}>{email}</a> : <span>the contact details that will be published on this page</span>
}
