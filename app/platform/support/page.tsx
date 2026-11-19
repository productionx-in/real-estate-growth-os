// app/platform/support/page.tsx — Internal Support queue: cases opened by customers from their Help page.
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LifeBuoy } from 'lucide-react'
import { getConsoleAccess } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'
import { can, listCases, type Db, type StaffRole } from '@/lib/platform/portal'
import { Badge, Card, EmptyState } from '@/components/ui'

export const metadata: Metadata = { title: 'Support' }
export const dynamic = 'force-dynamic'
const PRIORITY_TONE = { urgent: 'danger', high: 'warning', normal: 'neutral', low: 'neutral' } as const

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ status?: string; mine?: string }> }) {
  const access = await getConsoleAccess()
  if (access.state !== 'ok') return null
  const role = access.role as StaffRole
  if (!can(role, 'supportRead')) notFound()
  const sp = await searchParams
  const r = await listCases(createServiceClient() as unknown as Db, { userId: access.userId, role }, { status: sp.status ?? 'active', mine: sp.mine === '1' })
  const rows = r.success ? r.data : []
  const when = (iso: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(iso))
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[18px] font-semibold">Support cases</h1>
        <p className="text-[13px] text-muted">Opened by customers from their Help page. To look at a customer&apos;s records, ask them for support access from the organisation page — it is time-limited and audited.</p>
      </div>
      <nav aria-label="Filter" className="flex gap-3 text-[13px]">
        {[['active', 'Active'], ['resolved', 'Resolved'], ['closed', 'Closed']].map(([v, l]) => <Link key={v} href={`/platform/support?status=${v}`} className={(sp.status ?? 'active') === v && sp.mine !== '1' ? 'font-semibold text-brand' : 'text-muted hover:text-foreground'}>{l}</Link>)}
        <Link href="/platform/support?mine=1&status=active" className={sp.mine === '1' ? 'font-semibold text-brand' : 'text-muted hover:text-foreground'}>Assigned to me</Link>
      </nav>
      <Card className="overflow-x-auto">
        {rows.length === 0 ? <EmptyState icon={LifeBuoy} title="No cases here" /> : (
          <table className="w-full min-w-[680px] text-[13px]">
            <thead><tr className="border-b border-default text-left text-muted"><th className="px-4 py-2.5 font-medium">Case</th><th className="px-3 font-medium">Organisation</th><th className="px-3 font-medium">Priority</th><th className="px-3 font-medium">Status</th><th className="px-3 font-medium">Updated</th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-default last:border-0 hover:bg-surface-hover">
                  <td className="px-4 py-2.5"><Link href={`/platform/support/${c.id}`} className="font-medium text-brand hover:underline">{c.subject}</Link><span className="ml-2 text-subtle">{c.category.replace('_', ' ')}</span></td>
                  <td className="px-3 text-muted">{c.org_name}</td>
                  <td className="px-3"><Badge tone={PRIORITY_TONE[c.priority as keyof typeof PRIORITY_TONE]}>{c.priority}</Badge></td>
                  <td className="px-3 text-muted">{c.status.replace(/_/g, ' ')}</td>
                  <td className="px-3 text-muted">{when(c.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
