// components/analytics/ReportCatalogue.tsx — the reports catalogue's tables (server component). Numbers come from
// lib/reports/catalogue.ts: the leads created in the period and what has happened to them so far.
import type { Catalogue } from '@/lib/reports/catalogue'
import { SOURCE_LABELS } from '@/lib/leads/view-filters'
import { STATUS_LABELS } from '@/lib/leads/transitions'
import type { LeadSource, LeadStatus } from '@/types/database'
import { BarList, ChartFrame, ColumnChart } from '@/components/ui/chart'
import { TableShell } from '@/components/ui/table'

const inr = (n: number) => n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)} L` : `₹${Math.round(n).toLocaleString('en-IN')}`
const p = (v: number | null) => (v === null ? '—' : `${v}%`)

function Table({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (!rows.length) return <p className="rounded-2xl border border-dashed border-default p-6 text-center text-[13px] text-muted">{empty}</p>
  return (
    <TableShell>
      <table className="data-table w-full min-w-[560px] text-left">
        <thead><tr>{head.map((h, i) => <th key={h} scope="col" className={`px-4 py-2.5 ${i ? 'num text-right' : ''}`}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={`px-4 py-2.5 ${j ? 'num text-right' : 'text-foreground'}`}>{c}</td>)}</tr>)}</tbody>
      </table>
    </TableShell>
  )
}

export function FunnelReport({ c }: { c: Catalogue }) {
  const rows = c.funnel.map((s) => ({ label: s.label, value: s.count, hint: s.fromPrevious === null ? undefined : `${p(s.fromPrevious)} of previous · ${p(s.fromTop)} of enquiries`, tone: 1 as const }))
  return (
    <ChartFrame title="Funnel" description="Leads created in the period, and how far they got." rows={rows} valueLabel="Leads">
      <BarList rows={rows} max={c.funnel[0]?.count} empty="No leads in this period." />
    </ChartFrame>
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
  const statuses = Object.entries(c.byStatus).sort((a, b) => b[1] - a[1])
  const daily = c.daily.map((d) => ({ label: d.day.slice(5), value: d.leads, tone: 1 as const }))
  return (
    <div className="space-y-4">
      <ChartFrame title="New leads per day" rows={daily} valueLabel="Leads">
        {daily.length ? <ColumnChart rows={daily} label="New leads per day" /> : <p className="py-6 text-center text-[13px] text-muted">No leads in this period.</p>}
      </ChartFrame>
      <Table empty="No leads in this period." head={['Stage now', 'Leads', 'Share']} rows={statuses.map(([s, n]) => [STATUS_LABELS[s as LeadStatus] ?? s, n, p(c.totals.leads ? Math.round((n / c.totals.leads) * 1000) / 10 : null)])} />
    </div>
  )
}
