// components/analytics/ReportCatalogue.tsx — the reports catalogue's tables (server component). Numbers come from
// lib/reports/catalogue.ts: the leads created in the period and what has happened to them so far.
import type { Catalogue } from '@/lib/reports/catalogue'
import { SOURCE_LABELS } from '@/lib/leads/view-filters'
import { STATUS_LABELS } from '@/lib/leads/transitions'
import type { LeadSource, LeadStatus } from '@/types/database'

const inr = (n: number) => n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)} L` : `₹${Math.round(n).toLocaleString('en-IN')}`
const p = (v: number | null) => (v === null ? '—' : `${v}%`)

function Table({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (!rows.length) return <p className="rounded-lg border border-dashed border-default p-6 text-center text-[13px] text-muted">{empty}</p>
  return (
    <div className="overflow-x-auto rounded-lg border border-default bg-surface">
      <table className="w-full min-w-[560px] text-[13px]">
        <thead><tr className="border-b border-default text-left text-[12px] text-muted">{head.map((h, i) => <th key={h} className={`px-3 py-2 font-medium ${i ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-default last:border-0">{r.map((c, j) => <td key={j} className={`px-3 py-2 ${j ? 'text-right tabular-nums' : 'text-foreground'}`}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

export function FunnelReport({ c }: { c: Catalogue }) {
  const top = Math.max(1, c.funnel[0]?.count ?? 0)
  return (
    <div className="space-y-2">
      {c.funnel.map((s) => (
        <div key={s.key} className="rounded-lg border border-default bg-surface p-3">
          <div className="flex items-baseline justify-between gap-2 text-[13px]">
            <span className="font-medium text-foreground">{s.label}</span>
            <span className="tabular-nums text-foreground">{s.count.toLocaleString('en-IN')} <span className="text-muted">{s.fromPrevious === null ? '' : `· ${p(s.fromPrevious)} of previous · ${p(s.fromTop)} of enquiries`}</span></span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-hover"><div className="h-full rounded-full bg-brand" style={{ width: `${(s.count / top) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  )
}

export function SourceReport({ c }: { c: Catalogue }) {
  return <Table empty="No leads in this period." head={['Source', 'Leads', 'Contacted', 'Visited', 'Booked', 'Booking value', 'Lead → booking']}
    rows={c.sources.map((s) => [SOURCE_LABELS[s.source as LeadSource] ?? s.source, s.leads, s.contacted, s.visited, s.booked, s.value ? inr(s.value) : '—', p(s.bookingRate)])} />
}

export function TeamReport({ c, names }: { c: Catalogue; names: Map<string, string> }) {
  return <Table empty="No leads in this period." head={['Person', 'Leads', 'Contacted', 'Contact rate', 'Visits done', 'Bookings', 'Booking value']}
    rows={c.people.map((r, i) => [<span key="n">{i < 3 && r.booked > 0 ? `${i + 1}. ` : ''}{r.profileId ? names.get(r.profileId) ?? 'Former member' : 'Unassigned'}</span>, r.leads, r.contacted, p(r.contactRate), r.visited, r.booked, r.value ? inr(r.value) : '—'])} />
}

export function LeadsReport({ c }: { c: Catalogue }) {
  const max = Math.max(1, ...c.daily.map((d) => d.leads))
  const statuses = Object.entries(c.byStatus).sort((a, b) => b[1] - a[1])
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-default bg-surface p-3">
        <p className="text-[12px] text-muted">New leads per day</p>
        <div className="mt-2 flex h-28 items-end gap-px" role="img" aria-label={`New leads per day; highest ${max}`}>
          {c.daily.map((d) => <div key={d.day} title={`${d.day}: ${d.leads}`} className="flex-1 rounded-t-sm bg-brand" style={{ height: `${(d.leads / max) * 100}%`, minHeight: d.leads ? 2 : 0 }} />)}
        </div>
        {c.daily.length > 0 && <div className="mt-1 flex justify-between text-[11px] text-subtle"><span>{c.daily[0].day}</span><span>{c.daily.at(-1)!.day}</span></div>}
      </div>
      <Table empty="No leads in this period." head={['Stage now', 'Leads', 'Share']} rows={statuses.map(([s, n]) => [STATUS_LABELS[s as LeadStatus] ?? s, n, p(c.totals.leads ? Math.round((n / c.totals.leads) * 1000) / 10 : null)])} />
    </div>
  )
}
