// app/(dashboard)/[orgSlug]/speed-to-lead/page.tsx
// Speed to lead: how fast new leads are contacted — overall, by salesperson, source, project and hour —
// plus lead quality by source. Managers, admins, owners and read-only auditors; not sales executives.
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageShell } from '@/components/layout/PageShell'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getPipelineTiming, getResponseReport, duration, pct, PIPELINE_STAGES, REPORT_PERIODS, withinTargetPct, type ReportPeriod, type ReportRow } from '@/lib/dal/reports'
import { getResponseSettings } from '@/lib/dal/follow-ups'
import { isManagement } from '@/lib/auth/permissions'

export const metadata: Metadata = { title: 'Speed to lead' }
export const dynamic = 'force-dynamic'

const SOURCE: Record<string, string> = {
  website: 'Website', meta_ads: 'Meta Ads', google_ads: 'Google Ads', '99acres': '99acres', housing: 'Housing.com',
  magicbricks: 'MagicBricks', whatsapp: 'WhatsApp', referral: 'Referral', walk_in: 'Walk-in', csv_import: 'CSV import', other: 'Other',
}

const mins = (m: number | null) => (m === null ? '—' : m < 1 ? '< 1 min' : m < 60 ? `${Math.round(m)} min` : `${(m / 60).toFixed(1)} h`)
const pctText = (v: number | null) => (v === null ? '—' : `${v}%`)

function Tile({ label, value, hint, tone = 'neutral' }: { label: string; value: string; hint?: string; tone?: 'good' | 'bad' | 'neutral' }) {
  const color = tone === 'good' ? 'text-success' : tone === 'bad' ? 'text-danger' : 'text-[var(--foreground)]'
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
      <p className="text-[12px] text-[var(--foreground-muted)]">{label}</p>
      <p className={`mt-1 text-[24px] font-bold tabular-nums ${color}`}>{value}</p>
      {hint && <p className="text-[11px] text-[var(--foreground-subtle)] mt-0.5">{hint}</p>}
    </div>
  )
}

function Table({ title, rows, labelFor, quality }: { title: string; rows: ReportRow[]; labelFor: (r: ReportRow) => string; quality?: boolean }) {
  return (
    <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4" aria-label={title}>
      <h2 className="text-[13px] font-semibold mb-3">{title}</h2>
      {rows.length === 0 ? <p className="text-[12px] text-[var(--foreground-subtle)]">No leads in this period.</p> : (
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-[12px] min-w-[560px]">
            <thead>
              <tr className="text-left text-[var(--foreground-muted)] border-b border-[var(--border)]">
                <th className="py-2 pr-3 font-medium">{title.replace('By ', '').replace(/^./, (c) => c.toUpperCase())}</th>
                <th className="py-2 px-2 font-medium text-right">Leads</th>
                <th className="py-2 px-2 font-medium text-right">Median response</th>
                <th className="py-2 px-2 font-medium text-right">90% within</th>
                <th className="py-2 px-2 font-medium text-right">On time</th>
                <th className="py-2 px-2 font-medium text-right">Not contacted</th>
                {quality && <><th className="py-2 px-2 font-medium text-right">Junk</th><th className="py-2 px-2 font-medium text-right">Qualified+</th><th className="py-2 px-2 font-medium text-right">Site visits</th><th className="py-2 pl-2 font-medium text-right">Booked</th></>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const onTime = withinTargetPct(r)
                return (
                  <tr key={r.key ?? 'none'} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2 pr-3 font-medium">{labelFor(r)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{r.leads}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{mins(r.median_min)}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{mins(r.p90_min)}</td>
                    <td className={`py-2 px-2 text-right tabular-nums ${onTime !== null && onTime < 80 ? 'text-danger font-semibold' : ''}`}>{pctText(onTime)}</td>
                    <td className={`py-2 px-2 text-right tabular-nums ${r.never_contacted > 0 ? 'text-danger font-semibold' : ''}`}>{r.never_contacted}</td>
                    {quality && <>
                      <td className="py-2 px-2 text-right tabular-nums">{pctText(pct(r.junk, r.leads))}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{pctText(pct(r.qualified_plus, r.leads))}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{r.site_visits}</td>
                      <td className="py-2 pl-2 text-right tabular-nums">{r.booked}</td>
                    </>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default async function SpeedToLeadPage({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ period?: string }> }) {
  const { orgSlug } = await params
  const { period: raw } = await searchParams
  const { org, role } = await getVerifiedWorkspace(orgSlug)
  if (!isManagement(role)) redirect(`/${orgSlug}/today`)
  const period: ReportPeriod = raw && raw in REPORT_PERIODS ? (raw as ReportPeriod) : '30d'
  const [report, settings, timing] = await Promise.all([getResponseReport(org.id, period), getResponseSettings(org.id), getPipelineTiming(org.id, period)])
  const o = report.overall
  const onTime = withinTargetPct(o)
  const peak = Math.max(1, ...report.by_hour.map((h) => h.leads))

  return (
    <PageShell
      title="Speed to lead"
      description={`How fast new leads are contacted · target: first call within ${settings.first_response_minutes} working minutes`}
      actions={
        <nav aria-label="Period" className="inline-flex p-0.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[12px]">
          {(Object.keys(REPORT_PERIODS) as ReportPeriod[]).map((p) => (
            <Link key={p} href={`/${orgSlug}/speed-to-lead?period=${p}`} aria-current={p === period ? 'page' : undefined}
              className={`px-3 py-1.5 rounded-md ${p === period ? 'bg-[var(--surface)] shadow-sm font-semibold' : 'text-[var(--foreground-muted)]'}`}>
              Last {REPORT_PERIODS[p]} days
            </Link>
          ))}
        </nav>
      }
    >
      <div className="max-w-6xl space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile label="Median first response" value={mins(o.median_min ?? null)} hint={`90% within ${mins(o.p90_min ?? null)}`} tone={o.median_min !== null && o.median_min <= settings.first_response_minutes ? 'good' : 'neutral'} />
          <Tile label="Contacted on time" value={pctText(onTime)} hint={`${o.within_target} of ${o.timed} timed leads`} tone={onTime === null ? 'neutral' : onTime >= 90 ? 'good' : onTime < 70 ? 'bad' : 'neutral'} />
          <Tile label="Never contacted" value={String(o.never_contacted)} hint={`of ${o.leads} leads`} tone={o.never_contacted > 0 ? 'bad' : 'good'} />
          <Tile label="Site visits · bookings" value={`${o.site_visits} · ${o.booked}`} hint={`${pctText(pct(o.qualified_plus, o.leads))} qualified or better`} />
        </div>

        {report.by_hour.length > 0 && (
          <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4" aria-label="Leads by hour of arrival">
            <h2 className="text-[13px] font-semibold">When leads arrive <span className="font-normal text-[var(--foreground-muted)]">· and how fast they are answered</span></h2>
            <div className="mt-4 flex items-end gap-1 h-32" role="list">
              {Array.from({ length: 24 }, (_, h) => {
                const row = report.by_hour.find((x) => x.hour === h)
                const n = row?.leads ?? 0
                const slow = row?.median_min !== null && row?.median_min !== undefined && row.median_min > settings.first_response_minutes
                return (
                  <div key={h} role="listitem" className="flex-1 flex flex-col items-center justify-end h-full"
                    aria-label={`${h}:00 — ${n} leads${row?.median_min != null ? `, median response ${mins(row.median_min)}` : ''}`}
                    title={`${h}:00 — ${n} leads${row?.median_min != null ? `, median ${mins(row.median_min)}` : ''}`}>
                    <div className={`w-full rounded-t ${slow ? 'bg-warning' : 'bg-brand'}`} style={{ height: `${(n / peak) * 100}%`, minHeight: n ? 2 : 0 }} />
                  </div>
                )
              })}
            </div>
            <div className="flex justify-between text-[10px] text-[var(--foreground-subtle)] mt-1"><span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>11 PM</span></div>
            <p className="mt-2 text-[11px] text-[var(--foreground-muted)]"><span className="inline-block w-2 h-2 rounded-sm bg-brand mr-1" />answered on target <span className="inline-block w-2 h-2 rounded-sm bg-warning ml-3 mr-1" />median slower than target · {report.timezone}</p>
          </section>
        )}

        <section className="rounded-xl border border-default bg-surface p-4" aria-labelledby="timing-h">
          <h2 id="timing-h" className="text-[13px] font-semibold">From enquiry to first call <span className="font-normal text-muted">· each step measured separately</span></h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead><tr className="border-b border-default text-left text-[12px] text-muted">
                <th className="py-2 pr-4 font-medium">Step</th><th className="py-2 pr-4 text-right font-medium">Median</th>
                <th className="py-2 pr-4 text-right font-medium">90% within</th><th className="py-2 text-right font-medium">Leads measured</th>
              </tr></thead>
              <tbody className="tabular">
                {PIPELINE_STAGES.map((st) => {
                  const v = timing.stages[st.key]
                  return (
                    <tr key={st.key} className="border-b border-default last:border-0">
                      <td className="py-2.5 pr-4"><span className="font-medium">{st.label}</span><span className="block text-[12px] text-subtle">{st.hint}</span></td>
                      <td className="py-2.5 pr-4 text-right">{duration(v?.p50)}</td>
                      <td className="py-2.5 pr-4 text-right">{duration(v?.p90)}</td>
                      <td className="py-2.5 text-right text-muted">{v?.n ?? 0}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[12px] text-muted">
            Saved within 30 s: {pctText(pct(timing.saved_within_30s, timing.saved_measured))} of {timing.saved_measured} ·
            Assigned within 5 s: {pctText(pct(timing.assigned_within_5s, timing.assigned_measured))} of {timing.assigned_measured}.
            Leads added by hand or imported have no receipt time and are not counted in the first two steps.
          </p>
        </section>

        <Table title="By salesperson" rows={report.by_rep} labelFor={(r) => r.label ?? 'Unassigned'} />
        <Table title="By source" rows={report.by_source} labelFor={(r) => SOURCE[r.key ?? ''] ?? r.key ?? 'Unknown'} quality />
        <Table title="By project" rows={report.by_project} labelFor={(r) => r.label ?? 'No project'} quality />
      </div>
    </PageShell>
  )
}
