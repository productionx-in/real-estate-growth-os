// app/platform/sales/page.tsx — Internal Sales: REGrow's own prospects. Executives see their own and unassigned
// prospects; managers, the Platform Owner and auditors see all. Never customer CRM data.
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Users } from 'lucide-react'
import { getConsoleAccess } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'
import { can, listProspects, type Db, type StaffRole } from '@/lib/platform/portal'
import { staffNames } from '@/lib/platform/insights'
import { ImportWebsiteButton, NewProspectForm } from '@/components/platform/PortalClient'
import { STAGE_LABEL, STAGE_TONE, WORKSPACE_STAGES } from '@/lib/platform/stages'
import { Badge, Card, CardContent, EmptyState } from '@/components/ui'
import { FilterTabs, PageHeader, TableCard, Td, Th } from '@/components/platform/ConsoleUI'

export const metadata: Metadata = { title: 'Sales' }
export const dynamic = 'force-dynamic'
const day = (iso: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(iso))

type SP = { stage?: string; mine?: string; owner?: string; due?: string; add?: string }

export default async function SalesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const access = await getConsoleAccess()
  if (access.state !== 'ok') return null
  const role = access.role as StaffRole
  if (!can(role, 'salesRead')) notFound()
  const sp = await searchParams
  const db = createServiceClient() as unknown as Db
  const r = await listProspects(db, { userId: access.userId, role })
  const all = r.success ? r.data : []
  const names = await staffNames(db, all.map((p) => p.owner_user_id))
  const now = new Date(), endOfToday = new Date(now); endOfToday.setHours(23, 59, 59, 999)
  const isOpen = (p: (typeof all)[number]) => !['won', 'lost'].includes(p.stage)
  const overdue = (p: (typeof all)[number]) => isOpen(p) && !!p.next_follow_up_at && new Date(p.next_follow_up_at) < now
  const dueToday = (p: (typeof all)[number]) => isOpen(p) && !!p.next_follow_up_at && new Date(p.next_follow_up_at) >= now && new Date(p.next_follow_up_at) <= endOfToday

  // Scope (who) × stage × due, each from the URL.
  const scoped = all.filter((p) => (sp.mine === '1' ? p.owner_user_id === access.userId : sp.owner === 'none' ? !p.owner_user_id : true))
  const rows = scoped
    .filter((p) => !sp.stage || p.stage === sp.stage)
    .filter((p) => (sp.due === 'overdue' ? overdue(p) : sp.due === 'today' ? dueToday(p) || overdue(p) : true))
    .sort((a, b) => Number(overdue(b)) - Number(overdue(a)) || ((a.next_follow_up_at ?? '9') < (b.next_follow_up_at ?? '9') ? -1 : 1))
  const href = (over: Partial<SP>) => {
    const p = new URLSearchParams(Object.entries({ stage: sp.stage, mine: sp.mine, owner: sp.owner, due: sp.due, ...over }).filter(([, v]) => v) as [string, string][])
    return `/platform/sales${p.toString() ? `?${p}` : ''}`
  }
  const canWrite = can(role, 'salesWrite')

  return (
    <div className="space-y-5">
      <PageHeader title="Sales pipeline"
        description={<>REGrow&apos;s own prospects: website requests, referrals and outbound. {can(role, 'salesAll') ? 'You see every prospect.' : 'You see your own prospects and unassigned ones.'}</>}
        actions={<>
          {can(role, 'salesAll') && role !== 'auditor' && <ImportWebsiteButton />}
          {canWrite && <Link href={sp.add ? href({ add: undefined }) : `${href({})}${href({}).includes('?') ? '&' : '?'}add=1#add`} className="btn-primary inline-flex min-h-10 items-center rounded-lg bg-brand px-4 text-[13px] font-medium text-brand-foreground hover:bg-brand-hover">{sp.add ? 'Close' : 'Add prospect'}</Link>}
        </>} />

      {canWrite && sp.add && <Card id="add" className="rounded-2xl"><CardContent className="p-5"><NewProspectForm /></CardContent></Card>}

      <div className="space-y-3">
        <FilterTabs label="Whose prospects" tabs={[
          { href: href({ mine: undefined, owner: undefined }), label: can(role, 'salesAll') ? 'Everyone' : 'Mine and unassigned', count: all.filter(isOpen).length, active: !sp.mine && !sp.owner },
          { href: href({ mine: '1', owner: undefined }), label: 'Mine', count: all.filter((p) => isOpen(p) && p.owner_user_id === access.userId).length, active: sp.mine === '1' },
          { href: href({ owner: 'none', mine: undefined }), label: 'Unassigned', count: all.filter((p) => isOpen(p) && !p.owner_user_id).length, active: sp.owner === 'none' },
          { href: href({ due: sp.due === 'today' ? undefined : 'today' }), label: 'Due today', count: scoped.filter((p) => dueToday(p) || overdue(p)).length, active: sp.due === 'today' },
          { href: href({ due: sp.due === 'overdue' ? undefined : 'overdue' }), label: 'Overdue', count: scoped.filter(overdue).length, active: sp.due === 'overdue', tone: 'danger' },
        ]} />
        <FilterTabs label="Stage" tabs={[
          { href: href({ stage: undefined }), label: 'All stages', active: !sp.stage },
          ...Object.entries(STAGE_LABEL).map(([v, l]) => ({ href: href({ stage: v }), label: l, count: scoped.filter((p) => p.stage === v).length, active: sp.stage === v })),
        ]} />
      </div>

      {rows.length === 0 ? <Card className="rounded-2xl"><EmptyState icon={Users} title="No prospects here" description={sp.due ? 'Nothing due. Nice.' : 'Change the filters, or add a prospect.'} /></Card> : (
        <TableCard minWidth={820}>
          <thead><tr><Th>Company</Th><Th>Stage</Th><Th>Workspace</Th><Th>Source</Th><Th>Next follow-up</Th><Th>Owner</Th><Th className="text-right">Added</Th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="hover:bg-surface-hover">
                <Td>
                  <Link href={`/platform/sales/${p.id}`} className="font-medium hover:underline">{p.company_name}</Link>
                  <span className="block text-[12px] text-muted">{p.org_type === 'channel_partner' ? 'Agency' : 'Developer'}{p.city ? ` · ${p.city}` : ''}{p.contact_name ? ` · ${p.contact_name}` : ''}</span>
                </Td>
                <Td><Badge tone={STAGE_TONE[p.stage] ?? 'neutral'}>{STAGE_LABEL[p.stage] ?? p.stage}</Badge></Td>
                <Td>{p.linked_org_id
                  ? <Link href={`/platform/organisations/${p.linked_org_id}`} className="text-[13px] font-medium text-brand hover:underline">Created · open</Link>
                  : WORKSPACE_STAGES.includes(p.stage) ? <span className="text-[13px] font-medium text-danger">Missing</span>
                  : <span className="text-[13px] text-muted">Not yet</span>}</Td>
                <Td className="text-muted">{p.source === 'website' ? 'Website' : p.source}</Td>
                <Td className={overdue(p) ? 'font-semibold text-danger' : dueToday(p) ? 'font-medium text-warning' : 'text-muted'}>
                  {p.next_follow_up_at ? `${overdue(p) ? 'Overdue · ' : dueToday(p) ? 'Today · ' : ''}${day(p.next_follow_up_at)}` : isOpen(p) ? 'Not set' : '—'}
                </Td>
                <Td className="text-muted">{p.owner_user_id ? (p.owner_user_id === access.userId ? 'You' : names.get(p.owner_user_id) ?? 'Staff member') : <span className="text-warning">Unassigned</span>}</Td>
                <Td className="text-right tabular-nums text-muted">{day(p.created_at)}</Td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}
    </div>
  )
}
