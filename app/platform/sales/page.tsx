// app/platform/sales/page.tsx — Internal Sales: REGrow's own prospects. Executives see their own and unassigned
// prospects; managers, the Platform Owner and auditors see all. Never customer CRM data.
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getConsoleAccess } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'
import { can, listProspects, type Db, type StaffRole } from '@/lib/platform/portal'
import { ImportWebsiteButton, NewProspectForm, STAGE_LABEL } from '@/components/platform/PortalClient'
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState } from '@/components/ui'
import { Users } from 'lucide-react'

export const metadata: Metadata = { title: 'Sales' }
export const dynamic = 'force-dynamic'

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ stage?: string; mine?: string }> }) {
  const access = await getConsoleAccess()
  if (access.state !== 'ok') return null
  const role = access.role as StaffRole
  if (!can(role, 'salesRead')) notFound()
  const sp = await searchParams
  const r = await listProspects(createServiceClient() as unknown as Db, { userId: access.userId, role }, { stage: sp.stage, mine: sp.mine === '1' })
  const rows = r.success ? r.data : []
  const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(iso)) : '—')
  const overdue = (iso: string | null) => !!iso && new Date(iso) < new Date()
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[18px] font-semibold">Sales pipeline</h1>
          <p className="text-[13px] text-muted">REGrow&apos;s own prospects. {can(role, 'salesAll') ? 'You see every prospect.' : 'You see your prospects and unassigned ones.'}</p>
        </div>
        {can(role, 'salesAll') && role !== 'auditor' && <ImportWebsiteButton />}
      </div>
      <nav aria-label="Filter by stage" className="flex flex-wrap gap-2 text-[13px]">
        <Link href="/platform/sales" className={!sp.stage ? 'font-semibold text-brand' : 'text-muted hover:text-foreground'}>All</Link>
        {Object.entries(STAGE_LABEL).map(([v, l]) => <Link key={v} href={`/platform/sales?stage=${v}`} className={sp.stage === v ? 'font-semibold text-brand' : 'text-muted hover:text-foreground'}>{l}</Link>)}
        <Link href="/platform/sales?mine=1" className={sp.mine === '1' ? 'font-semibold text-brand' : 'text-muted hover:text-foreground'}>Mine</Link>
      </nav>
      <Card className="overflow-x-auto">
        {rows.length === 0 ? <EmptyState icon={Users} title="No prospects here yet" /> : (
          <table className="w-full min-w-[720px] text-[13px]">
            <thead><tr className="border-b border-default text-left text-muted"><th className="px-4 py-2.5 font-medium">Company</th><th className="px-3 font-medium">Type</th><th className="px-3 font-medium">Stage</th><th className="px-3 font-medium">Source</th><th className="px-3 font-medium">Next follow-up</th><th className="px-3 font-medium">Owner</th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-default last:border-0 hover:bg-surface-hover">
                  <td className="px-4 py-2.5"><Link href={`/platform/sales/${p.id}`} className="font-medium text-brand hover:underline">{p.company_name}</Link>{p.city && <span className="ml-2 text-subtle">{p.city}</span>}</td>
                  <td className="px-3 text-muted">{p.org_type === 'channel_partner' ? 'Agency' : 'Developer'}</td>
                  <td className="px-3"><Badge tone={p.stage === 'won' ? 'success' : p.stage === 'lost' ? 'neutral' : 'brand'}>{STAGE_LABEL[p.stage]}</Badge></td>
                  <td className="px-3 text-muted">{p.source}</td>
                  <td className={`px-3 ${overdue(p.next_follow_up_at) && !['won', 'lost'].includes(p.stage) ? 'text-danger font-semibold' : 'text-muted'}`}>{when(p.next_follow_up_at)}</td>
                  <td className="px-3 text-muted">{p.owner_user_id ? (p.owner_user_id === access.userId ? 'You' : 'Assigned') : 'Unassigned'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {can(role, 'salesWrite') && (
        <Card><CardHeader><CardTitle>Add a prospect</CardTitle></CardHeader><CardContent><NewProspectForm /></CardContent></Card>
      )}
    </div>
  )
}
