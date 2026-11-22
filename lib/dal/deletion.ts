// lib/dal/deletion.ts — what stops a project or a unit from being deleted. Deleting a project removes its towers,
// units, plot maps and import history with it, and the database would also remove its bookings, deals and site
// visits; deleting a unit would remove its status history. So a delete is refused while anything that records real
// business is attached — the reasons are shown to the person so they know what to do instead. Owners and admins
// only (the routes authorise); every query is scoped by organisation.
import { createServiceClient } from '@/lib/supabase/server'

export interface Blocker { what: string; count: number }

async function count(table: string, filter: (q: any) => any): Promise<number> { // eslint-disable-line @typescript-eslint/no-explicit-any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = (createServiceClient() as unknown as { from: (t: string) => any }).from(table).select('id', { count: 'exact', head: true })
  const { count: n, error } = await filter(q)
  if (error) throw new Error(`${table}: ${error.message}`)
  return n ?? 0
}

/** Reasons a project cannot be deleted (empty = it can). */
export async function projectDeleteBlockers(orgId: string, projectId: string): Promise<Blocker[]> {
  const scoped = (q: any) => q.eq('org_id', orgId).eq('project_id', projectId) // eslint-disable-line @typescript-eslint/no-explicit-any
  const [bookings, deals, visits, held, partners] = await Promise.all([
    count('bookings', scoped),
    count('deals', scoped),
    count('site_visits', scoped),
    count('inventory_items', (q) => scoped(q).in('status', ['on_hold', 'booked', 'sold'])),
    count('partnership_projects', (q) => q.eq('project_id', projectId)),
  ])
  return [
    { what: 'booking', count: bookings }, { what: 'deal', count: deals }, { what: 'site visit', count: visits },
    { what: 'unit on hold, booked or sold', count: held }, { what: 'channel-partner arrangement', count: partners },
  ].filter((b) => b.count > 0)
}

/** Reasons a unit cannot be deleted (empty = it can). */
export async function unitDeleteBlockers(orgId: string, unitId: string, status: string): Promise<Blocker[]> {
  const out: Blocker[] = []
  if (['on_hold', 'booked', 'sold'].includes(status)) out.push({ what: `unit that is ${status === 'on_hold' ? 'on hold' : status}`, count: 1 })
  const bookings = await count('bookings', (q) => q.eq('org_id', orgId).eq('inventory_id', unitId))
  if (bookings) out.push({ what: 'booking', count: bookings })
  return out
}

/** "2 bookings and 1 site visit" */
export function describeBlockers(b: Blocker[]): string {
  const parts = b.map((x) => (x.what.startsWith('unit that is') ? `it is ${x.what.replace('unit that is ', '')}` : `${x.count} ${x.what}${x.count === 1 ? '' : 's'}`))
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}
