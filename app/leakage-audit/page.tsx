// app/leakage-audit/page.tsx — public, self-serve lead-leakage audit (the file never leaves the browser).
import type { Metadata } from 'next'
import { PRODUCT_NAME } from '@/lib/brand'
import { MarketingShell } from '@/components/marketing/MarketingShell'
import { LeakageAudit } from '@/components/audit/LeakageAudit'

export const metadata: Metadata = {
  title: { absolute: `Free lead-leakage audit — ${PRODUCT_NAME}` },
  description: 'Drop in last month’s lead export and see how fast leads were contacted, how many never were, and what it costs. Your file never leaves your browser.',
  alternates: { canonical: '/leakage-audit' },
}

export default function LeakageAuditPage() {
  return (
    <MarketingShell>
      <section className="mx-auto max-w-5xl px-4 sm:px-6 py-12">
        <div className="max-w-2xl print:hidden">
          <p className="text-[13px] font-semibold uppercase tracking-wider text-[var(--brand)]">Free lead-leakage audit</p>
          <h1 className="mt-2 text-[34px] sm:text-[42px] font-extrabold tracking-tight leading-tight">How many of your leads are never called back?</h1>
          <p className="mt-4 text-[16px] text-[var(--foreground-muted)] leading-relaxed">
            Export last month’s leads from your CRM or spreadsheet and drop the file below. In a few seconds you will see your real response
            times, the leads nobody contacted, and which sources and salespeople leak the most.
          </p>
        </div>
        <div className="mt-8"><LeakageAudit /></div>
      </section>
    </MarketingShell>
  )
}
