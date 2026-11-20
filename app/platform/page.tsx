// app/platform/page.tsx — console home: real figures for the signed-in staff member's role. No sample data.
import type { Metadata } from 'next'
import Link from 'next/link'
import { Building2, IndianRupee, LifeBuoy, Users } from 'lucide-react'
import { getConsoleAccess } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'
import { can, dashboardActivity, dashboardFigures, ROLE_LABEL, type Db, type StaffRole } from '@/lib/platform/portal'
import { AttentionList, KpiCard, Panel, Rings, TrendChart } from '@/components/platform/DashboardWidgets'

export const metadata: Metadata = { title: 'Dashboard' }
export const dynamic = 'force-dynamic'
const inr = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100)
const IST = 'Asia/Kolkata'
const weekLabel = (weeksAgo: number) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: IST }).format(new Date(Date.now() - weeksAgo * 7 * 86_400_000))
const when = (iso: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: IST }).format(new Date(iso))
const humanise = (s: string) => s.replace(/[._]/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

export default async function PlatformDashboard() {
  const access = await getConsoleAccess()
  if (access.state !== 'ok') return null
  const role = access.role as StaffRole
  const db = createServiceClient() as unknown as Db
  const actor = { userId: access.userId, role }
  const [f, act] = await Promise.all([dashboardFigures(db, actor), dashboardActivity(db, actor)])
  if (!f || !act) return null

  const workspaces = f.organisations.developer + f.organisations.agency
  const labels = act.workspaces.map((_, i) => weekLabel(act.workspaces.length - 1 - i))
  const attention = [
    { label: 'Urgent support cases', detail: 'Customers waiting on an urgent case', count: can(role, 'supportRead') ? f.support.urgent : 0, href: '/platform/support', tone: 'bad' as const },
    { label: 'Follow-ups overdue', detail: 'Prospects whose follow-up date has passed', count: f.sales?.followUpsDue ?? 0, href: '/platform/sales', tone: 'bad' as const },
    { label: 'Trials ending this week', detail: 'Convert or extend before they lapse', count: f.subscriptions.trialsEndingThisWeek, href: '/platform/organisations', tone: 'warn' as const },
    { label: 'Read-only workspaces', detail: 'Billing hold or suspended', count: f.organisations.readOnly, href: '/platform/organisations', tone: 'warn' as const },
    { label: 'Support access requests', detail: 'Pending or active, customer-approved', count: can(role, 'supportRead') ? f.support.grants : 0, href: '/platform/support', tone: 'ok' as const },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">Welcome back, {access.label.split(/[\s@]/)[0]}</h1>
        <p className="mt-1 text-[13px] text-muted">{ROLE_LABEL[role]} · live figures. Customer business data is never shown here.</p>
      </div>

      <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Customer workspaces" value={workspaces} icon={Building2} tone="highlight"
          hint={`${f.organisations.developer} developers · ${f.organisations.agency} agencies`} href={can(role, 'organisations') ? '/platform/organisations' : undefined} />
        <KpiCard label="Paying subscriptions" value={f.subscriptions.paying} icon={Users} tone="good"
          hint={`${f.subscriptions.trial} on trial · ${f.subscriptions.expired} expired`} />
        <KpiCard label="Monthly recurring revenue" value={inr(f.mrrPaise)} icon={IndianRupee} hint="Contracted prices, before GST" />
        {can(role, 'supportRead')
          ? <KpiCard label="Open support cases" value={f.support.open} icon={LifeBuoy} tone={f.support.urgent ? 'bad' : 'neutral'} hint={`${f.support.urgent} urgent`} href="/platform/support" />
          : f.sales
            ? <KpiCard label="Open prospects" value={f.sales.open} icon={LifeBuoy} hint={`${f.sales.won} won`} href="/platform/sales" />
            : <KpiCard label="Read-only workspaces" value={f.organisations.readOnly} icon={LifeBuoy} tone={f.organisations.readOnly ? 'bad' : 'neutral'} />}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Growth" className="lg:col-span-2" action={<span className="rounded-lg border border-default px-2.5 py-1 text-[12px] text-muted">Last 12 weeks</span>}>
          <TrendChart primary={act.workspaces} primaryLabel="New workspaces" labels={labels}
            secondary={act.prospects} secondaryLabel="New prospects" />
        </Panel>
        <Panel title="Needs attention">
          <AttentionList items={attention} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Recent staff activity" className="lg:col-span-2"
          action={act.recent.length ? <Link href="/platform/audit" className="text-[13px] font-medium text-brand hover:underline">View all</Link> : undefined}>
          {act.recent.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted">
              {['super_admin', 'auditor'].includes(role) ? 'No staff actions recorded yet.' : 'The activity log is visible to the Platform Owner and auditors.'}
            </p>
          ) : (
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full min-w-[520px] text-[13px]">
                <thead>
                  <tr className="border-b border-default text-left text-[12px] text-muted">
                    <th scope="col" className="px-5 pb-2.5 font-medium">Action</th>
                    <th scope="col" className="px-3 pb-2.5 font-medium">By</th>
                    <th scope="col" className="px-3 pb-2.5 font-medium">On</th>
                    <th scope="col" className="px-5 pb-2.5 text-right font-medium">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-default">
                  {act.recent.map((r) => (
                    <tr key={r.id}>
                      <td className="px-5 py-3 font-medium">{humanise(r.action)}</td>
                      <td className="px-3 py-3 text-muted">{ROLE_LABEL[r.actor_role as StaffRole] ?? r.actor_role}</td>
                      <td className="px-3 py-3"><span className="rounded-md bg-surface-hover px-2 py-0.5 text-[12px] text-muted">{humanise(r.target_entity_type)}</span></td>
                      <td className="whitespace-nowrap px-5 py-3 text-right text-muted tabular-nums">{when(r.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel title="Subscriptions">
          <Rings centre={String(f.subscriptions.paying + f.subscriptions.trial + f.subscriptions.expired)} centreLabel="subscriptions"
            rings={[
              { label: 'Paying', value: f.subscriptions.paying, color: 'var(--console-highlight)' },
              { label: 'On trial', value: f.subscriptions.trial, color: 'var(--brand)' },
              { label: 'Expired', value: f.subscriptions.expired, color: 'var(--border-strong)' },
            ]} />
        </Panel>
      </div>
    </div>
  )
}
