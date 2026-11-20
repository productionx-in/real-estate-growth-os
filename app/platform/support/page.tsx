// app/platform/support/page.tsx — Internal Support queue: cases opened by customers from their Help page.
// Urgent first, then oldest. Opening a customer's records needs a support access grant they approve.
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LifeBuoy } from 'lucide-react'
import { getConsoleAccess } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'
import { can, listCases, type Db, type StaffRole } from '@/lib/platform/portal'
import { ageLabel, caseAges, staffNames } from '@/lib/platform/insights'
import { Badge, Card, EmptyState } from '@/components/ui'
import { FilterTabs, PageHeader, TableCard, Td, Th } from '@/components/platform/ConsoleUI'

export const metadata: Metadata = { title: 'Support' }
export const dynamic = 'force-dynamic'
const PRIORITY_TONE = { urgent: 'danger', high: 'warning', normal: 'neutral', low: 'neutral' } as const
const PRI = ['urgent', 'high', 'normal', 'low']
const STATUS_LABEL: Record<string, string> = { open: 'Open', in_progress: 'In progress', waiting_on_customer: 'Waiting on customer', resolved: 'Resolved', closed: 'Closed' }
const when = (iso: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(iso))

type SP = { status?: string; mine?: string; assignee?: string; priority?: string }

export default async function SupportPage({ searchParams }: { searchParams: Promise<SP> }) {
  const access = await getConsoleAccess()
  if (access.state !== 'ok') return null
  const role = access.role as StaffRole
  if (!can(role, 'supportRead')) notFound()
  const sp = await searchParams
  const status = sp.status ?? 'active'
  const db = createServiceClient() as unknown as Db
  const r = await listCases(db, { userId: access.userId, role }, { status })
  const all = r.success ? r.data : []
  const names = await staffNames(db, all.map((c) => c.assignee_user_id))
  const scoped = all.filter((c) => (sp.mine === '1' ? c.assignee_user_id === access.userId : sp.assignee === 'none' ? !c.assignee_user_id : true))
  const rows = scoped
    .filter((c) => !sp.priority || c.priority === sp.priority)
    .sort((a, b) => PRI.indexOf(a.priority) - PRI.indexOf(b.priority) || (a.created_at < b.created_at ? -1 : 1))
  const href = (over: Partial<SP>) => {
    const p = new URLSearchParams(Object.entries({ status: sp.status, mine: sp.mine, assignee: sp.assignee, priority: sp.priority, ...over }).filter(([, v]) => v) as [string, string][])
    return `/platform/support${p.toString() ? `?${p}` : ''}`
  }
  const active = status === 'active'

  return (
    <div className="space-y-5">
      <PageHeader title="Support"
        description="Cases customers open from their Help page, urgent first and then oldest. To look at a customer's records, ask them for support access from their organisation page. Access is time-limited and audited." />
      <div className="space-y-3">
        <FilterTabs label="Status" tabs={[
          { href: href({ status: undefined }), label: 'Active', active: active },
          { href: href({ status: 'resolved' }), label: 'Resolved', active: status === 'resolved' },
          { href: href({ status: 'closed' }), label: 'Closed', active: status === 'closed' },
        ]} />
        <FilterTabs label="Assignment and priority" tabs={[
          { href: href({ mine: undefined, assignee: undefined }), label: 'Everyone', count: all.length, active: !sp.mine && !sp.assignee },
          { href: href({ mine: '1', assignee: undefined }), label: 'Assigned to me', count: all.filter((c) => c.assignee_user_id === access.userId).length, active: sp.mine === '1' },
          { href: href({ assignee: 'none', mine: undefined }), label: 'Unassigned', count: all.filter((c) => !c.assignee_user_id).length, active: sp.assignee === 'none', tone: 'danger' },
          ...PRI.map((p) => ({ href: href({ priority: sp.priority === p ? undefined : p }), label: p[0].toUpperCase() + p.slice(1), count: scoped.filter((c) => c.priority === p).length, active: sp.priority === p, tone: p === 'urgent' ? 'danger' as const : undefined })),
        ]} />
      </div>
      {rows.length === 0 ? <Card className="rounded-2xl"><EmptyState icon={LifeBuoy} title="No cases here" description={active ? 'The queue is clear for this filter.' : undefined} /></Card> : (
        <TableCard minWidth={860}>
          <thead><tr><Th>Case</Th><Th>Customer</Th><Th>Priority</Th><Th>Status</Th><Th>Assignee</Th><Th className="text-right">{active ? 'Waiting' : 'Updated'}</Th></tr></thead>
          <tbody>
            {rows.map((c) => {
              const age = caseAges([c.created_at]).oldestHours
              return (
                <tr key={c.id} className="hover:bg-surface-hover">
                  <Td><Link href={`/platform/support/${c.id}`} className="font-medium hover:underline">{c.subject}</Link><span className="block text-[12px] text-muted">{c.category.replace(/_/g, ' ')}</span></Td>
                  <Td className="text-muted">{c.org_name}</Td>
                  <Td><Badge tone={PRIORITY_TONE[c.priority as keyof typeof PRIORITY_TONE] ?? 'neutral'}>{c.priority}</Badge></Td>
                  <Td className="text-muted">{STATUS_LABEL[c.status] ?? c.status}</Td>
                  <Td className="text-muted">{c.assignee_user_id ? (c.assignee_user_id === access.userId ? 'You' : names.get(c.assignee_user_id) ?? 'Staff member') : <span className="text-warning">Unassigned</span>}</Td>
                  <Td className={`text-right tabular-nums ${active && (age ?? 0) > 48 ? 'font-semibold text-danger' : 'text-muted'}`}>{active ? ageLabel(age) : when(c.updated_at)}</Td>
                </tr>
              )
            })}
          </tbody>
        </TableCard>
      )}
    </div>
  )
}
