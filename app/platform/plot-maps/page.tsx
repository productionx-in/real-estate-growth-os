// app/platform/plot-maps/page.tsx — REGrow's Interactive Plot Map set-up queue: every project with the add-on active,
// where its set-up stands (stages derived from recorded steps), the expected completion, overdue work, blockers and
// who on the team looks after it. Metadata only — no plots, inventory or buyers; the map itself is the customer's.
import type { Metadata } from 'next'
import Link from 'next/link'
import { getConsoleAccess } from '@/lib/auth/platform'
import { CAN, can, type StaffRole } from '@/lib/platform/portal'
import { setupQueue } from '@/lib/dal/plot-map-setup'
import { staffNames } from '@/lib/platform/insights'
import { createServiceClient } from '@/lib/supabase/server'
import { Alert, Badge } from '@/components/ui'
import { FilterTabs, PageHeader, TableCard, Td, Th } from '@/components/platform/ConsoleUI'
import { PlotMapSetupActions } from '@/components/platform/PlotMapSetupActions'

export const metadata: Metadata = { title: 'Map set-ups' }
export const dynamic = 'force-dynamic'

const when = (iso: string | null) => iso ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(iso)) : '—'

export default async function PlotMapSetupQueuePage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const access = await getConsoleAccess()
  if (access.state !== 'ok') return null
  if (!can(access.role as StaffRole, 'plotMapSetup')) return <Alert tone="warning">Only the Platform Owner, platform admins and support see map set-ups.</Alert>
  const { show = 'open' } = await searchParams
  const db = createServiceClient()
  const [rows, { data: team }] = await Promise.all([
    setupQueue(),
    db.from('platform_users').select('user_id, role').eq('is_active', true).in('role', [...CAN.plotMapSetup]),
  ])
  const names = await staffNames(db as never, (team ?? []).map((t) => t.user_id))
  const staff = (team ?? []).map((t) => ({ userId: t.user_id as string, name: names.get(t.user_id as string) ?? 'Staff member' }))
  const open = rows.filter((r) => r.view.completed < r.view.stages.length)
  const list = show === 'overdue' ? open.filter((r) => r.view.overdue) : show === 'blocked' ? open.filter((r) => r.openBlockers.length)
    : show === 'unassigned' ? open.filter((r) => !r.assignee) : show === 'done' ? rows.filter((r) => r.view.completed === r.view.stages.length) : open
  return (
    <div className="space-y-5">
      <PageHeader title="Map set-ups" description="Interactive Plot Map set-ups in progress. Stages complete only from recorded steps; estimates are in working hours (Mon–Sat, 10:00–19:00 IST) and pause while a blocker waits on the customer." />
      <FilterTabs label="Filter" tabs={[
        { href: '?show=open', label: 'In progress', count: open.length, active: show === 'open' },
        { href: '?show=overdue', label: 'Overdue', count: open.filter((r) => r.view.overdue).length, active: show === 'overdue', tone: 'danger' },
        { href: '?show=blocked', label: 'Blocked', count: open.filter((r) => r.openBlockers.length).length, active: show === 'blocked' },
        { href: '?show=unassigned', label: 'Unassigned', count: open.filter((r) => !r.assignee).length, active: show === 'unassigned' },
        { href: '?show=done', label: 'Published', count: rows.length - open.length, active: show === 'done' },
      ]} />
      {list.length === 0 ? <p className="text-[13px] text-muted">Nothing here.</p> : (
        <TableCard minWidth={1000}>
          <thead><tr><Th>Workspace · project</Th><Th>Now</Th><Th>Progress</Th><Th>Stage due</Th><Th>Expected ready</Th><Th>Plots</Th><Th className="w-80">Team &amp; blockers</Th></tr></thead>
          <tbody>
            {list.map((r) => (
                <tr key={r.projectId} className="align-top">
                  <Td><Link className="font-medium text-brand hover:underline" href={`/platform/organisations/${r.orgId}`}>{r.orgName}</Link><div className="text-[12px] text-muted">{r.projectName}</div></Td>
                  <Td>
                    {r.view.current ? <>{r.view.current.label}<div className="text-[12px] text-muted">{r.view.current.owner === 'customer' ? 'With the customer' : r.view.current.owner === 'system' ? 'Automatic' : 'With REGrow'}</div></> : 'Published'}
                    {r.view.overdue && <Badge tone="danger" className="mt-1">Overdue</Badge>}
                    {r.view.waitingOnCustomer && <Badge tone="warning" className="mt-1">Paused · customer</Badge>}
                  </Td>
                  <Td className="tabular-nums">{r.view.completed}/{r.view.stages.length}</Td>
                  <Td>{when(r.view.currentDue)}</Td>
                  <Td>{when(r.view.estimate)}</Td>
                  <Td className="tabular-nums">{r.plots}</Td>
                  <Td><PlotMapSetupActions orgId={r.orgId} projectId={r.projectId} assigneeUserId={r.assigneeUserId} staff={staff} blockers={r.openBlockers} /></Td>
                </tr>
            ))}
          </tbody>
        </TableCard>
      )}
    </div>
  )
}
