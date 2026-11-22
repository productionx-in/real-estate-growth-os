// app/(dashboard)/[orgSlug]/analytics/page.tsx — the reports catalogue: overview (inventory and channels), funnel,
// sources, team leaderboard, leads, and response time (Speed to lead). Organisation-wide, so only for roles that see
// every lead (checked here, on the server). Cohort reports: the leads created in the period and what happened to them.
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Download } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getExecutiveBiAnalytics } from '@/lib/dal/analytics'
import { CATALOGUE_PERIODS, getCatalogue, memberNames, type CataloguePeriod } from '@/lib/dal/report-catalogue'
import { ExecutiveBiDashboardView } from '@/components/analytics/ExecutiveBiDashboardView'
import { FunnelReport, LeadsReport, SourceReport, TeamReport } from '@/components/analytics/ReportCatalogue'
import { leadScopeOf } from '@/lib/auth/permissions'
import { cn } from '@/lib/utils/cn'

export const metadata: Metadata = { title: 'Reports' }
export const dynamic = 'force-dynamic'

const REPORTS = {
  overview: { label: 'Overview', hint: 'Inventory absorption, conversion and channels, all time.' },
  funnel: { label: 'Funnel', hint: 'Enquiries → contacted → site visit done → booked.' },
  sources: { label: 'Sources', hint: 'Leads, visits, bookings and booking value by where the lead came from.' },
  team: { label: 'Team', hint: 'Leaderboard: what each person did with the leads assigned to them.' },
  leads: { label: 'Leads', hint: 'New leads per day and where they stand now.' },
} as const
type ReportKey = keyof typeof REPORTS
const PERIOD_LABEL: Record<CataloguePeriod, string> = { '7d': '7 days', '30d': '30 days', '90d': '90 days', '365d': '12 months' }

export default async function AnalyticsPage({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ report?: string; period?: string }> }) {
  const { orgSlug } = await params
  const { report: r, period: pr } = await searchParams
  const { org, role } = await getVerifiedWorkspace(orgSlug)
  // Server-authoritative: organisation-wide reports are for roles that see every lead.
  if (leadScopeOf(role) !== 'all') redirect(`/${orgSlug}`)
  const report: ReportKey = r && r in REPORTS ? (r as ReportKey) : 'overview'
  const period: CataloguePeriod = pr && pr in CATALOGUE_PERIODS ? (pr as CataloguePeriod) : '30d'
  const href = (o: { report?: ReportKey; period?: CataloguePeriod }) => `/${orgSlug}/analytics?report=${o.report ?? report}&period=${o.period ?? period}`

  const [overview, catalogue, names] = await Promise.all([
    report === 'overview' ? getExecutiveBiAnalytics(org.id) : null,
    report === 'overview' ? null : getCatalogue(org.id, period),
    report === 'team' ? memberNames(org.id) : Promise.resolve(new Map<string, string>()),
  ])

  return (
    <PageShell title="Reports" description={REPORTS[report].hint}
      actions={catalogue ? (
        <a href={`/api/reports/catalogue?orgId=${org.id}&report=${report}&period=${period}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-default bg-surface px-3 text-[13px] font-medium text-foreground hover:bg-surface-hover">
          <Download aria-hidden className="size-3.5" /> Download CSV
        </a>
      ) : undefined}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Reports" className="flex flex-wrap gap-1.5">
          {(Object.keys(REPORTS) as ReportKey[]).map((k) => (
            <Link key={k} href={href({ report: k })} aria-current={k === report ? 'page' : undefined}
              className={cn('inline-flex min-h-9 items-center rounded-full border px-3 text-[13px]', k === report ? 'border-brand bg-brand-light font-medium text-brand' : 'border-default text-foreground hover:bg-surface-hover')}>
              {REPORTS[k].label}
            </Link>
          ))}
          <Link href={`/${orgSlug}/speed-to-lead`} className="inline-flex min-h-9 items-center rounded-full border border-default px-3 text-[13px] text-foreground hover:bg-surface-hover">Response time</Link>
        </nav>
        {catalogue && (
          <nav aria-label="Period" className="flex gap-1">
            {(Object.keys(CATALOGUE_PERIODS) as CataloguePeriod[]).map((k) => (
              <Link key={k} href={href({ period: k })} aria-current={k === period ? 'page' : undefined}
                className={cn('inline-flex min-h-9 items-center rounded-md px-2.5 text-[12px]', k === period ? 'bg-surface-hover font-medium text-foreground' : 'text-muted hover:text-foreground')}>{PERIOD_LABEL[k]}</Link>
            ))}
          </nav>
        )}
      </div>
      {catalogue && (
        <p className="mb-3 text-[12px] text-muted">
          Leads created in the last {PERIOD_LABEL[period]} ({catalogue.totals.leads.toLocaleString('en-IN')}) and what has happened to them so far.
          {catalogue.capped && ' Showing the first 50,000 leads of this period.'}
        </p>
      )}
      {overview && <ExecutiveBiDashboardView analytics={overview} orgName={org.name} />}
      {catalogue && report === 'funnel' && <FunnelReport c={catalogue} />}
      {catalogue && report === 'sources' && <SourceReport c={catalogue} />}
      {catalogue && report === 'team' && <TeamReport c={catalogue} names={names} />}
      {catalogue && report === 'leads' && <LeadsReport c={catalogue} />}
    </PageShell>
  )
}
