// lib/reports/catalogue.ts — the reports catalogue's numbers (pure), from recorded facts only. A cohort report: the
// leads created in the period, and what has happened to them so far — contacted (a first action recorded), visited
// (a site visit completed), booked (a booking that is not cancelled). Nothing is estimated or filled in.

export interface RLead { id: string; source: string | null; status: string; assigned_to: string | null; created_at: string; first_action_at: string | null }
export interface RVisit { lead_id: string; status: string }
export interface RBooking { lead_id: string; status: string; total_amount: number | null }

export interface Stage { key: 'enquiries' | 'contacted' | 'visited' | 'booked'; label: string; count: number; fromPrevious: number | null; fromTop: number | null }
export interface SourceRow { source: string; leads: number; contacted: number; visited: number; booked: number; value: number; bookingRate: number | null }
export interface PersonRow { profileId: string | null; leads: number; contacted: number; visited: number; booked: number; value: number; contactRate: number | null }
export interface Catalogue {
  totals: { leads: number; contacted: number; visited: number; booked: number; value: number }
  funnel: Stage[]
  sources: SourceRow[]
  people: PersonRow[]
  byStatus: Record<string, number>
  daily: { day: string; leads: number }[]
}

export const pctOf = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null)

/** India calendar day of an instant, "YYYY-MM-DD". */
export const istDay = (iso: string) => new Date(new Date(iso).getTime() + 330 * 60_000).toISOString().slice(0, 10)

export function buildCatalogue(leads: RLead[], visits: RVisit[], bookings: RBooking[], days?: { from: Date; to: Date }): Catalogue {
  const visited = new Set(visits.filter((v) => v.status === 'completed').map((v) => v.lead_id))
  const bookedValue = new Map<string, number>()
  for (const b of bookings) if (b.status !== 'cancelled') bookedValue.set(b.lead_id, (bookedValue.get(b.lead_id) ?? 0) + Number(b.total_amount ?? 0))

  type Acc = { leads: number; contacted: number; visited: number; booked: number; value: number }
  const zero = (): Acc => ({ leads: 0, contacted: 0, visited: 0, booked: 0, value: 0 })
  const add = (a: Acc, l: RLead) => {
    a.leads++
    if (l.first_action_at) a.contacted++
    if (visited.has(l.id)) a.visited++
    if (bookedValue.has(l.id)) { a.booked++; a.value += bookedValue.get(l.id)! }
  }
  const totals = zero(), bySource = new Map<string, Acc>(), byPerson = new Map<string, Acc>(), byStatus: Record<string, number> = {}, byDay = new Map<string, number>()
  for (const l of leads) {
    add(totals, l)
    const s = l.source || 'other'; if (!bySource.has(s)) bySource.set(s, zero()); add(bySource.get(s)!, l)
    const p = l.assigned_to ?? ''; if (!byPerson.has(p)) byPerson.set(p, zero()); add(byPerson.get(p)!, l)
    byStatus[l.status] = (byStatus[l.status] ?? 0) + 1
    const d = istDay(l.created_at); byDay.set(d, (byDay.get(d) ?? 0) + 1)
  }
  const counts = [['enquiries', 'Enquiries', totals.leads], ['contacted', 'Contacted', totals.contacted], ['visited', 'Site visit done', totals.visited], ['booked', 'Booked', totals.booked]] as const
  const funnel: Stage[] = counts.map(([key, label, count], i) => ({ key, label, count, fromPrevious: i === 0 ? null : pctOf(count, counts[i - 1][2]), fromTop: i === 0 ? null : pctOf(count, totals.leads) }))

  const daily: { day: string; leads: number }[] = []
  if (days) {
    for (let t = new Date(istDay(days.from.toISOString()) + 'T00:00:00Z'); istDay(t.toISOString()) <= istDay(days.to.toISOString()) && daily.length < 400; t = new Date(t.getTime() + 86_400_000)) {
      const d = t.toISOString().slice(0, 10); daily.push({ day: d, leads: byDay.get(d) ?? 0 })
    }
  }
  return {
    totals, funnel, byStatus, daily,
    sources: [...bySource].map(([source, a]) => ({ source, ...a, bookingRate: pctOf(a.booked, a.leads) }))
      .sort((x, y) => y.booked - x.booked || y.value - x.value || y.leads - x.leads),
    people: [...byPerson].map(([p, a]) => ({ profileId: p || null, ...a, contactRate: pctOf(a.contacted, a.leads) }))
      .sort((x, y) => y.booked - x.booked || y.value - x.value || y.visited - x.visited || y.contacted - x.contacted),
  }
}
