// app/platform/organisations/page.tsx — every customer workspace with its health score, worst first. Metadata
// only (state, subscription, seats, last sign-in, open cases): never leads, buyers or documents.
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Building2, Plus } from 'lucide-react'
import { getConsoleAccess } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'
import { can, type Db, type StaffRole } from '@/lib/platform/portal'
import { customerHealth } from '@/lib/platform/insights'
import { Badge, Button, EmptyState, Input } from '@/components/ui'
import { FilterTabs, HealthBadge, PageHeader, TableCard, Td, Th } from '@/components/platform/ConsoleUI'

export const metadata: Metadata = { title: 'Organisations' }
export const dynamic = 'force-dynamic'

const STATE_TONE = { active: 'success', grace: 'warning', suspended: 'danger', deactivated: 'neutral', pending_setup: 'info' } as const
const SUB_LABEL: Record<string, string> = { active: 'Paying', trial: 'Trial', past_due: 'Payment overdue', expired: 'Expired', cancelled: 'Cancelled' }
const day = (iso: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(iso))

export default async function OrganisationsPage({ searchParams }: { searchParams: Promise<{ q?: string; health?: string; type?: string }> }) {
  const access = await getConsoleAccess()
  if (access.state !== 'ok') return null
  const role = access.role as StaffRole
  if (!can(role, 'organisations')) notFound()
  const sp = await searchParams
  const all = (await customerHealth(createServiceClient() as unknown as Db, { userId: access.userId, role })) ?? []
  const term = sp.q?.trim().toLowerCase()
  const inType = all.filter((o) => !sp.type || (sp.type === 'agency' ? o.type === 'channel_partner' : o.type === 'developer'))
  const rows = inType.filter((o) => (!sp.health || o.band === sp.health) && (!term || o.name.toLowerCase().includes(term)))
  const q = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ q: sp.q, health: sp.health, type: sp.type, ...over }).filter(([, v]) => v) as [string, string][])
    const s = p.toString()
    return `/platform/organisations${s ? `?${s}` : ''}`
  }
  const count = (b?: string) => inType.filter((o) => !b || o.band === b).length

  return (
    <div className="space-y-5">
      <PageHeader title="Organisations" description="Every customer workspace, least healthy first. Health uses workspace details only. Opening a customer's records needs their approval through a support access grant."
        actions={role === 'super_admin' ? <Button asChild><Link href="/admin/provision"><Plus className="size-4" aria-hidden="true" />Provision customer</Link></Button> : undefined} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterTabs label="Filter by health" tabs={[
          { href: q({ health: undefined }), label: 'All', count: count(), active: !sp.health },
          { href: q({ health: 'at_risk' }), label: 'At risk', count: count('at_risk'), active: sp.health === 'at_risk', tone: 'danger' },
          { href: q({ health: 'watch' }), label: 'Watch', count: count('watch'), active: sp.health === 'watch' },
          { href: q({ health: 'healthy' }), label: 'Healthy', count: count('healthy'), active: sp.health === 'healthy' },
        ]} />
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <FilterTabs label="Filter by type" tabs={[
            { href: q({ type: undefined }), label: 'All types', active: !sp.type },
            { href: q({ type: 'developer' }), label: 'Developers', active: sp.type === 'developer' },
            { href: q({ type: 'agency' }), label: 'Agencies', active: sp.type === 'agency' },
          ]} />
          <form role="search" className="w-full sm:w-56">
            {sp.health && <input type="hidden" name="health" value={sp.health} />}
            {sp.type && <input type="hidden" name="type" value={sp.type} />}
            <label htmlFor="q" className="sr-only">Search organisations</label>
            <Input id="q" name="q" defaultValue={sp.q} placeholder="Search by name" />
          </form>
        </div>
      </div>
      {rows.length === 0 ? <TableCard minWidth={0}><tbody><tr><td><EmptyState icon={Building2} title="No organisations match" description="Try another filter or search." /></td></tr></tbody></TableCard> : (
        <TableCard minWidth={900}>
          <thead><tr><Th>Customer</Th><Th>Health</Th><Th>Why</Th><Th>Subscription</Th><Th className="text-right">Members / seats</Th><Th className="text-right">Last sign-in</Th><Th className="text-right">Cases</Th></tr></thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className="hover:bg-surface-hover">
                <Td>
                  <Link href={`/platform/organisations/${o.id}`} className="font-medium hover:underline">{o.name}</Link>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
                    {o.type === 'channel_partner' ? 'Agency' : 'Developer'}
                    <Badge tone={STATE_TONE[o.lifecycle as keyof typeof STATE_TONE] ?? 'neutral'}>{o.lifecycle.replace('_', ' ')}</Badge>
                  </span>
                </Td>
                <Td><HealthBadge band={o.band} score={o.score} /></Td>
                <Td className="max-w-[260px] text-muted">{o.reasons.length ? o.reasons.join(' · ') : 'No issues'}</Td>
                <Td>
                  <span className={o.subStatus === 'past_due' || o.subStatus === 'expired' ? 'font-medium text-danger' : ''}>{o.subStatus ? SUB_LABEL[o.subStatus] ?? o.subStatus : 'None'}</span>
                  {o.periodEnd && <span className="block text-[12px] text-muted">{o.subStatus === 'trial' ? 'Trial ends' : 'Renews'} {day(o.periodEnd)}</span>}
                </Td>
                <Td className="text-right tabular-nums">{o.members}{o.seats !== null && <span className="text-muted"> / {o.seats}</span>}</Td>
                <Td className="text-right tabular-nums text-muted">{o.lastSignIn ? day(o.lastSignIn) : 'Never'}</Td>
                <Td className={`text-right tabular-nums ${o.openCases ? 'font-medium' : 'text-muted'}`}>{o.openCases}</Td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}
    </div>
  )
}
