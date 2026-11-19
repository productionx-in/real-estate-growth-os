// app/platform/page.tsx — console home: real figures for the signed-in staff member's role. No sample data.
import type { Metadata } from 'next'
import Link from 'next/link'
import { getConsoleAccess } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'
import { can, dashboardFigures, ROLE_LABEL, type Db, type StaffRole } from '@/lib/platform/portal'
import { StatCard } from '@/components/ui'

export const metadata: Metadata = { title: 'Dashboard' }
export const dynamic = 'force-dynamic'
const inr = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100)

export default async function PlatformDashboard() {
  const access = await getConsoleAccess()
  if (access.state !== 'ok') return null
  const role = access.role as StaffRole
  const f = await dashboardFigures(createServiceClient() as unknown as Db, { userId: access.userId, role })
  if (!f) return null
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[18px] font-semibold">Welcome, {access.label}</h1>
        <p className="text-[13px] text-muted">{ROLE_LABEL[role]} · live figures from the database. Customer business data is never shown here.</p>
      </div>
      <section aria-labelledby="customers" className="space-y-3">
        <h2 id="customers" className="text-[14px] font-semibold">Customers</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Developer workspaces" value={f.organisations.developer} />
          <StatCard label="Agency workspaces" value={f.organisations.agency} />
          <StatCard label="Paying subscriptions" value={f.subscriptions.paying} hint={`${f.subscriptions.trial} on trial · ${f.subscriptions.trialsEndingThisWeek} ending within 7 days`} />
          <StatCard label="Monthly recurring revenue" value={inr(f.mrrPaise)} hint="Contracted prices, before GST" />
          <StatCard label="Read-only workspaces" value={f.organisations.readOnly} tone={f.organisations.readOnly ? 'bad' : 'neutral'} />
          <StatCard label="Expired subscriptions" value={f.subscriptions.expired} />
        </div>
      </section>
      {f.sales && (
        <section aria-labelledby="sales" className="space-y-3">
          <h2 id="sales" className="text-[14px] font-semibold"><Link href="/platform/sales" className="hover:underline">Sales pipeline</Link></h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Open prospects" value={f.sales.open} />
            <StatCard label="Follow-ups overdue" value={f.sales.followUpsDue} tone={f.sales.followUpsDue ? 'bad' : 'neutral'} />
            <StatCard label="Won" value={f.sales.won} tone="good" />
          </div>
        </section>
      )}
      {can(role, 'supportRead') && (
        <section aria-labelledby="support" className="space-y-3">
          <h2 id="support" className="text-[14px] font-semibold"><Link href="/platform/support" className="hover:underline">Support</Link></h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Open cases" value={f.support.open} />
            <StatCard label="Urgent" value={f.support.urgent} tone={f.support.urgent ? 'bad' : 'neutral'} />
            <StatCard label="Support access requests / grants" value={f.support.grants} hint="Customer-approved, time-limited" />
          </div>
        </section>
      )}
    </div>
  )
}
