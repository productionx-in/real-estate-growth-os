// lib/reports/csv.ts — catalogue reports as CSV (pure). Values that a spreadsheet would run as a formula (=, +, -, @,
// tab, carriage return at the start) are prefixed with an apostrophe.
import type { Catalogue } from '@/lib/reports/catalogue'

export function cell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const rows = (head: string[], body: unknown[][]) => [head, ...body].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'

export function catalogueCsv(report: 'funnel' | 'sources' | 'team' | 'leads', c: Catalogue, names: Map<string, string>): string {
  switch (report) {
    case 'funnel': return rows(['Stage', 'Leads', '% of previous', '% of enquiries'], c.funnel.map((s) => [s.label, s.count, s.fromPrevious ?? '', s.fromTop ?? '']))
    case 'sources': return rows(['Source', 'Leads', 'Contacted', 'Visited', 'Booked', 'Booking value (INR)', 'Lead to booking %'], c.sources.map((s) => [s.source, s.leads, s.contacted, s.visited, s.booked, s.value, s.bookingRate ?? '']))
    case 'team': return rows(['Person', 'Leads', 'Contacted', 'Contact rate %', 'Visits done', 'Bookings', 'Booking value (INR)'], c.people.map((p) => [p.profileId ? names.get(p.profileId) ?? 'Former member' : 'Unassigned', p.leads, p.contacted, p.contactRate ?? '', p.visited, p.booked, p.value]))
    case 'leads': return rows(['Day (IST)', 'New leads'], c.daily.map((d) => [d.day, d.leads]))
  }
}
