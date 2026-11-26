// app/platform/website/page.tsx — Website analytics: how visitors find re.productionx.in, which pages they move
// through and how many reach "Book a demo". First-party, cookie-free counts (site_pageviews, 20260105); Vercel Web
// Analytics runs alongside for the Vercel dashboard. Platform Owner, sales managers and auditors only.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { getConsoleAccess } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'
import { can, type StaffRole } from '@/lib/platform/portal'
import { DEMO_PATH, RANGES, loadSiteAnalytics } from '@/lib/platform/site-analytics'
import { FilterTabs, PageHeader } from '@/components/platform/ConsoleUI'
import { BarList, ChartFrame, ColumnChart, StatTile } from '@/components/ui/chart'
import { EmptyState } from '@/components/ui'
import { TableShell } from '@/components/ui/table'

export const metadata: Metadata = { title: 'Website analytics' }
export const dynamic = 'force-dynamic'

const page = (p: string) => (p === '/' ? 'Home' : p)

export default async function WebsiteAnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const access = await getConsoleAccess()
  if (access.state !== 'ok') return null
  if (!can(access.role as StaffRole, 'website')) notFound()
  const asked = Number((await searchParams).days)
  const days = (RANGES as readonly number[]).includes(asked) ? asked : 30
  const r = await loadSiteAnalytics(createServiceClient() as unknown as Parameters<typeof loadSiteAnalytics>[0], days)

  const header = (
    <>
      <PageHeader title="Website analytics" description="Visitors to the public website: where they came from, the pages they moved through, and how many reached Book a demo. No cookies and no personal data; a visit is one browser tab." />
      <FilterTabs label="Period" tabs={RANGES.map((d) => ({ href: `/platform/website?days=${d}`, label: `Last ${d} days`, active: d === days }))} />
    </>
  )
  if ('error' in r) return <div className="space-y-6">{header}<EmptyState title="Website analytics could not load" description="Please try again in a minute." /></div>
  const s = r.summary
  if (!s.visits) return <div className="space-y-6">{header}<EmptyState title="No visits recorded yet" description="Counting starts once this version is live on the website. Open the site in a normal browser tab and refresh this page." /></div>

  const daily = s.daily.map((d) => ({ label: d.label.slice(5), value: d.value, tone: 1 as const }))
  return (
    <div className="space-y-6">
      {header}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Visits" value={s.visits.toLocaleString('en-IN')} hint={`${s.pageviews.toLocaleString('en-IN')} page views`} />
        <StatTile label="Pages per visit" value={s.pagesPerVisit} hint={s.bounceRate === null ? undefined : `${s.bounceRate}% left after one page`} />
        <StatTile label="Reached Book a demo" value={s.demoVisits.toLocaleString('en-IN')} hint={s.demoRate === null ? undefined : `${s.demoRate}% of visits`} tone={2} />
        <StatTile label="Top source" value={s.sources[0]?.label ?? '—'} hint={s.sources[0] ? `${s.sources[0].value} visits` : undefined} />
      </div>
      {r.truncated && <p className="text-[12px] text-warning">Showing the most recent 50,000 page views of this period.</p>}

      <ChartFrame title="Visits per day" description="India time." rows={daily} valueLabel="Visits">
        <ColumnChart rows={daily} label="Visits per day" />
      </ChartFrame>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartFrame title="Where visitors come from" description="Campaign tag when present, otherwise the referring site." rows={s.sources.map((x) => ({ ...x, tone: 1 as const }))} valueLabel="Visits">
          <BarList rows={s.sources.map((x) => ({ ...x, tone: 1 as const }))} empty="No visits yet." />
        </ChartFrame>
        <ChartFrame title="Most viewed pages" rows={s.pages.map((x) => ({ ...x, label: page(x.label), tone: 4 as const }))} valueLabel="Views">
          <BarList rows={s.pages.map((x) => ({ ...x, label: page(x.label), tone: 4 as const }))} empty="No page views yet." />
        </ChartFrame>
      </div>

      <section aria-labelledby="flow-heading" className="space-y-3">
        <div>
          <h2 id="flow-heading" className="text-[15px] font-semibold text-foreground">Visitor flow</h2>
          <p className="text-[12px] text-muted">The most common moves from one page to the next.</p>
        </div>
        {s.flows.length ? (
          <ol className="grid gap-2 sm:grid-cols-2">
            {s.flows.map((f) => (
              <li key={`${f.from}>${f.to}`} className="surface-raised flex items-center gap-2 rounded-xl border border-default bg-surface px-3 py-2 text-[13px]">
                <span className="min-w-0 truncate text-foreground">{page(f.from)}</span>
                <ArrowRight className="size-3.5 shrink-0 text-subtle" aria-label="then" />
                <span className={`min-w-0 truncate ${f.to === DEMO_PATH ? 'font-semibold text-success' : 'text-foreground'}`}>{page(f.to)}</span>
                <span className="ml-auto shrink-0 tabular-nums text-muted">{f.value}</span>
              </li>
            ))}
          </ol>
        ) : <p className="text-[13px] text-muted">Every visit so far viewed one page.</p>}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="entry-heading" className="space-y-3">
          <h2 id="entry-heading" className="text-[15px] font-semibold text-foreground">Landing pages</h2>
          <TableShell>
            <table className="data-table w-full text-left">
              <thead><tr><th scope="col" className="px-4 py-2.5">First page</th><th scope="col" className="num px-4 py-2.5 text-right">Visits</th><th scope="col" className="num px-4 py-2.5 text-right">Reached demo</th></tr></thead>
              <tbody>{s.entries.map((e) => (
                <tr key={e.label}><td className="px-4 py-2.5 text-foreground">{page(e.label)}</td><td className="num px-4 py-2.5 text-right">{e.value}</td>
                  <td className="num px-4 py-2.5 text-right">{e.demo} <span className="text-muted">({Math.round((e.demo / e.value) * 100)}%)</span></td></tr>
              ))}</tbody>
            </table>
          </TableShell>
        </section>
        <div className="grid gap-6">
          <ChartFrame title="Where visits ended" rows={s.exits.map((x) => ({ ...x, label: page(x.label), tone: 3 as const }))} valueLabel="Visits">
            <BarList rows={s.exits.map((x) => ({ ...x, label: page(x.label), tone: 3 as const }))} empty="—" />
          </ChartFrame>
          <div className="grid gap-6 sm:grid-cols-2">
            <ChartFrame title="Countries" rows={s.countries.map((x) => ({ ...x, tone: 2 as const }))} valueLabel="Visits">
              <BarList rows={s.countries.map((x) => ({ ...x, tone: 2 as const }))} empty="—" />
            </ChartFrame>
            <ChartFrame title="Devices" rows={s.devices.map((x) => ({ ...x, tone: 5 as const }))} valueLabel="Visits">
              <BarList rows={s.devices.map((x) => ({ ...x, tone: 5 as const }))} empty="—" />
            </ChartFrame>
          </div>
        </div>
      </div>
    </div>
  )
}
