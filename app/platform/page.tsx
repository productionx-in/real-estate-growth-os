// app/platform/page.tsx — console home, built per role (docs/design/console-roles.md). Live figures only;
// workspace metadata and REGrow's own data, never a customer's leads, buyers or documents.
import type { Metadata } from 'next'
import Link from 'next/link'
import {
  AlarmClock, AlertTriangle, BadgeIndianRupee, Building2, CalendarClock, ClipboardList, Hourglass, IndianRupee,
  Inbox, LifeBuoy, Receipt, RefreshCcw, ScrollText, Scale, ShieldAlert, Target, Trophy, UserX, Users,
} from 'lucide-react'
import { getConsoleAccess } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'
import { dashboardActivity, dashboardFigures, ROLE_LABEL, type Db, type StaffRole } from '@/lib/platform/portal'
import { ageLabel, auditDigest, customerHealth, financeBoard, salesBoard, supportBoard } from '@/lib/platform/insights'
import { KpiCard, Panel, Rings, TrendChart } from '@/components/platform/DashboardWidgets'
import { FocusTile, FunnelBars, HealthBadge, QueueList, Td, Th } from '@/components/platform/ConsoleUI'
import { STAGE_LABEL } from '@/components/platform/PortalClient'

export const metadata: Metadata = { title: 'Home' }
export const dynamic = 'force-dynamic'
const IST = 'Asia/Kolkata'
const inr = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(paise / 100)
const day = (iso: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: IST }).format(new Date(iso))
const when = (iso: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: IST }).format(new Date(iso))
const weekLabel = (weeksAgo: number) => day(new Date(Date.now() - weeksAgo * 7 * 86_400_000).toISOString())
const humanise = (s: string) => s.replace(/[._]/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
const greeting = () => { const h = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: IST }).format(new Date())); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' }

const FOCUS_LINE: Record<StaffRole, string> = {
  super_admin: 'The business at a glance: revenue, customers who need attention and how the team is keeping up.',
  platform_admin: 'Customer health: who is stuck in setup, who has gone quiet and who is read-only.',
  finance_admin: 'Money that needs action today, and what renews soon.',
  sales_manager: 'Your pipeline and your team: where deals stall and who is behind on follow-ups.',
  sales_rep: 'Whom to contact today, and how your pipeline is moving.',
  support_agent: 'The support queue: urgent first, then whatever has waited longest.',
  auditor: 'What staff changed this week. Read-only.',
}

export default async function ConsoleHome() {
  const access = await getConsoleAccess()
  if (access.state !== 'ok') return null
  const role = access.role as StaffRole
  const db = createServiceClient() as unknown as Db
  const actor = { userId: access.userId, role }
  const [f, act, health, sales, support, finance, audit] = await Promise.all([
    dashboardFigures(db, actor), dashboardActivity(db, actor), customerHealth(db, actor),
    salesBoard(db, actor), supportBoard(db, actor), financeBoard(db, actor), auditDigest(db, actor),
  ])
  if (!f || !act) return null

  const atRisk = health?.filter((h) => h.band === 'at_risk') ?? []
  const watch = health?.filter((h) => h.band === 'watch') ?? []
  const setupStuck = health?.filter((h) => h.reasons.some((r) => r.startsWith('Invitations') || r === 'Nobody has signed in yet')) ?? []
  const labels = act.workspaces.map((_, i) => weekLabel(act.workspaces.length - 1 - i))
  const teamOverdue = sales?.team.reduce((n, t) => n + t.overdue, 0) ?? 0

  // ── Focus row: four numbers that decide what this person does first ─────────────────────────────
  const focus: Record<StaffRole, React.ReactNode[]> = {
    super_admin: [
      <FocusTile key="r" label="Customers at risk" value={atRisk.length} icon={ShieldAlert} tone={atRisk.length ? 'bad' : 'good'} href="/platform/organisations?health=at_risk" hint={`${watch.length} on watch`} />,
      <FocusTile key="u" label="Urgent support cases" value={support?.byPriority.urgent ?? 0} icon={AlertTriangle} tone={support?.byPriority.urgent ? 'bad' : 'good'} href="/platform/support" hint={`${support?.unassigned ?? 0} unassigned`} />,
      <FocusTile key="f" label="Refunds awaiting approval" value={finance?.refundsPending ?? 0} icon={Receipt} tone={finance?.refundsPending ? 'warn' : 'good'} href="/platform/payments" hint={`${finance?.alerts ?? 0} payment alerts`} />,
      <FocusTile key="s" label="Follow-ups overdue (team)" value={teamOverdue} icon={AlarmClock} tone={teamOverdue ? 'warn' : 'good'} href="/platform/sales" hint={`${sales?.unassignedWebsite.length ?? 0} website requests unassigned`} />,
    ],
    platform_admin: [
      <FocusTile key="r" label="Customers at risk" value={atRisk.length} icon={ShieldAlert} tone={atRisk.length ? 'bad' : 'good'} href="/platform/organisations?health=at_risk" />,
      <FocusTile key="w" label="On watch" value={watch.length} icon={Hourglass} tone={watch.length ? 'warn' : 'good'} href="/platform/organisations?health=watch" />,
      <FocusTile key="s" label="Setup not finished" value={setupStuck.length} icon={UserX} tone={setupStuck.length ? 'warn' : 'good'} href="/platform/organisations?health=at_risk" hint="Invites pending or nobody signed in" />,
      <FocusTile key="c" label="Open support cases" value={support?.total ?? f.support.open} icon={LifeBuoy} tone={(support?.byPriority.urgent ?? 0) ? 'bad' : 'neutral'} href="/platform/support" hint={`${support?.byPriority.urgent ?? f.support.urgent} urgent`} />,
    ],
    finance_admin: [
      <FocusTile key="a" label="Payment alerts" value={finance?.alerts ?? 0} icon={AlertTriangle} tone={finance?.alerts ? 'bad' : 'good'} href="/platform/payments" />,
      <FocusTile key="r" label="Refunds awaiting approval" value={finance?.refundsPending ?? 0} icon={Receipt} tone={finance?.refundsPending ? 'warn' : 'good'} href="/platform/payments" />,
      <FocusTile key="x" label="Reconciliation exceptions" value={finance?.reconciliation ?? 0} icon={Scale} tone={finance?.reconciliation ? 'warn' : 'good'} href="/platform/payments" hint={`${finance?.unapplied ?? 0} unapplied · ${finance?.disputes ?? 0} disputes`} />,
      <FocusTile key="n" label="Renewals in 30 days" value={finance?.renewalsCount ?? 0} icon={RefreshCcw} href="/platform/payments" />,
    ],
    sales_manager: [
      <FocusTile key="w" label="Website requests unassigned" value={sales?.unassignedWebsite.length ?? 0} icon={Inbox} tone={sales?.unassignedWebsite.length ? 'warn' : 'good'} href="/platform/sales?owner=none" />,
      <FocusTile key="o" label="Follow-ups overdue (team)" value={teamOverdue} icon={AlarmClock} tone={teamOverdue ? 'bad' : 'good'} href="/platform/sales?due=overdue" />,
      <FocusTile key="p" label="Open pipeline" value={sales?.funnel.open ?? 0} icon={Target} href="/platform/sales" hint={`${sales?.newThisMonth ?? 0} new this month`} />,
      <FocusTile key="r" label="Win rate" value={sales?.funnel.winRate === null || !sales ? '—' : `${sales.funnel.winRate}%`} icon={Trophy} tone="good" href="/platform/sales?stage=won" hint={`${sales?.funnel.won ?? 0} won · ${sales?.funnel.lost ?? 0} lost`} />,
    ],
    sales_rep: [
      <FocusTile key="t" label="Follow-ups due today" value={sales?.myDueToday ?? 0} icon={CalendarClock} tone={sales?.myDueToday ? 'warn' : 'good'} href="/platform/sales?mine=1&due=today" />,
      <FocusTile key="o" label="Overdue" value={sales?.myOverdue ?? 0} icon={AlarmClock} tone={sales?.myOverdue ? 'bad' : 'good'} href="/platform/sales?mine=1&due=overdue" />,
      <FocusTile key="p" label="My open prospects" value={sales?.funnel.open ?? 0} icon={Target} href="/platform/sales?mine=1" />,
      <FocusTile key="u" label="Unassigned to pick up" value={sales?.unassigned ?? 0} icon={Inbox} href="/platform/sales?owner=none" />,
    ],
    support_agent: [
      <FocusTile key="u" label="Urgent" value={support?.byPriority.urgent ?? 0} icon={AlertTriangle} tone={support?.byPriority.urgent ? 'bad' : 'good'} href="/platform/support?priority=urgent" />,
      <FocusTile key="n" label="Unassigned" value={support?.unassigned ?? 0} icon={Inbox} tone={support?.unassigned ? 'warn' : 'good'} href="/platform/support?assignee=none" />,
      <FocusTile key="m" label="Assigned to me" value={support?.mine ?? 0} icon={ClipboardList} href="/platform/support?mine=1" />,
      <FocusTile key="a" label="Oldest waiting" value={ageLabel(support?.oldestHours ?? null)} icon={Hourglass} tone={(support?.oldestHours ?? 0) > 48 ? 'bad' : 'neutral'} href="/platform/support" hint={`Median ${ageLabel(support?.medianHours ?? null)}`} />,
    ],
    auditor: [
      <FocusTile key="a" label="Staff actions, 7 days" value={audit?.total ?? 0} icon={ScrollText} href="/platform/audit" />,
      <FocusTile key="r" label="Customers at risk" value={atRisk.length} icon={ShieldAlert} href="/platform/organisations?health=at_risk" />,
      <FocusTile key="g" label="Support access in use" value={f.support.grants} icon={LifeBuoy} href="/platform/organisations" hint="Customer-approved, time-limited" />,
      <FocusTile key="p" label="Payment alerts" value={finance?.alerts ?? 0} icon={AlertTriangle} href="/platform/payments" />,
    ],
  }

  // ── Panels ───────────────────────────────────────────────────────────────────────────────────────
  const healthPanel = health && (
    <Panel title="Customers needing attention" className="lg:col-span-2" action={<Link href="/platform/organisations" className="text-[13px] font-medium text-brand hover:underline">All customers</Link>}>
      {health.filter((h) => h.band !== 'healthy').length === 0 ? <p className="py-6 text-center text-[13px] text-muted">Every customer is healthy.</p> : (
        <div className="-mx-5 -mb-5 overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead><tr><Th>Customer</Th><Th>Health</Th><Th>Why</Th><Th className="text-right">Last sign-in</Th></tr></thead>
            <tbody>
              {health.filter((h) => h.band !== 'healthy').slice(0, 6).map((h) => (
                <tr key={h.id} className="hover:bg-surface-hover">
                  <Td><Link href={`/platform/organisations/${h.id}`} className="font-medium hover:underline">{h.name}</Link><span className="block text-[12px] text-muted">{h.type === 'channel_partner' ? 'Agency' : 'Developer'} · {h.members} member{h.members === 1 ? '' : 's'}</span></Td>
                  <Td><HealthBadge band={h.band} score={h.score} /></Td>
                  <Td className="text-muted">{h.reasons.slice(0, 2).join(' · ')}</Td>
                  <Td className="text-right tabular-nums text-muted">{h.lastSignIn ? day(h.lastSignIn) : 'Never'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
  const healthMix = health && (
    <Panel title="Customer health">
      <Rings centre={String(health.length)} centreLabel="customers" rings={[
        { label: 'Healthy', value: health.length - atRisk.length - watch.length, color: 'var(--success)' },
        { label: 'Watch', value: watch.length, color: 'var(--console-highlight)' },
        { label: 'At risk', value: atRisk.length, color: 'var(--danger)' },
      ]} />
    </Panel>
  )
  const growth = (
    <Panel title="Growth" className="lg:col-span-2" action={<span className="rounded-lg border border-default px-2.5 py-1 text-[12px] text-muted">Last 12 weeks</span>}>
      <TrendChart primary={act.workspaces} primaryLabel="New workspaces" labels={labels} secondary={act.prospects} secondaryLabel="New prospects" />
    </Panel>
  )
  const subscriptions = (
    <Panel title="Subscriptions">
      <Rings centre={String(f.subscriptions.paying + f.subscriptions.trial + f.subscriptions.expired)} centreLabel="subscriptions" rings={[
        { label: 'Paying', value: f.subscriptions.paying, color: 'var(--console-highlight)' },
        { label: 'On trial', value: f.subscriptions.trial, color: 'var(--brand)' },
        { label: 'Expired', value: f.subscriptions.expired, color: 'var(--border-strong)' },
      ]} />
    </Panel>
  )
  const funnelPanel = sales && (
    <Panel title={sales.all ? 'Pipeline by stage' : 'My pipeline'} action={sales.funnel.winRate !== null ? <span className="text-[12px] text-muted">Win rate <strong className="text-foreground">{sales.funnel.winRate}%</strong></span> : undefined}>
      <FunnelBars rows={(['new', 'contacted', 'interested', 'qualified', 'demo_scheduled', 'demo_done', 'trial_started', 'negotiation', 'won'] as const).map((s) => ({ label: STAGE_LABEL[s], value: sales.funnel.byStage[s], href: `/platform/sales?stage=${s}` }))} />
    </Panel>
  )
  const teamPanel = sales?.all && (
    <Panel title="Sales team" className="lg:col-span-2">
      {sales.team.length === 0 ? <p className="py-6 text-center text-[13px] text-muted">No prospects are assigned yet. Assign them from the Sales pipeline.</p> : (
        <div className="-mx-5 -mb-5 overflow-x-auto">
          <table className="w-full min-w-[440px] text-[13px]">
            <thead><tr><Th>Person</Th><Th className="text-right">Open</Th><Th className="text-right">Overdue</Th><Th className="text-right">Won</Th></tr></thead>
            <tbody>
              {sales.team.map((t) => (
                <tr key={t.userId}>
                  <Td className="font-medium">{t.name}</Td>
                  <Td className="text-right tabular-nums">{t.open}</Td>
                  <Td className={`text-right tabular-nums ${t.overdue ? 'font-semibold text-danger' : 'text-muted'}`}>{t.overdue}</Td>
                  <Td className="text-right tabular-nums">{t.won}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
  const websitePanel = sales && (sales.all || role === 'sales_rep') && (
    <Panel title="New website requests" action={<Link href="/platform/sales?owner=none" className="text-[13px] font-medium text-brand hover:underline">Unassigned</Link>}>
      <QueueList empty="No unassigned website requests." items={sales.unassignedWebsite.map((p) => ({ href: `/platform/sales/${p.id}`, title: p.company_name, detail: p.city ?? 'Website form', note: day(p.created_at) }))} />
    </Panel>
  )
  const myFollowUps = sales && (
    <Panel title="My follow-ups" className="lg:col-span-2" action={<Link href="/platform/sales?mine=1" className="text-[13px] font-medium text-brand hover:underline">My prospects</Link>}>
      <QueueList empty="Nothing due today. Good time to work the pipeline." items={sales.myFollowUps.map((p) => {
        const overdue = new Date(p.next_follow_up_at!) < new Date()
        return { href: `/platform/sales/${p.id}`, title: p.company_name, detail: STAGE_LABEL[p.stage as keyof typeof STAGE_LABEL], note: overdue ? `Overdue · ${day(p.next_follow_up_at!)}` : 'Today', noteTone: overdue ? 'danger' as const : 'warn' as const }
      })} />
    </Panel>
  )
  const queuePanel = support && (
    <Panel title="Waiting longest" className="lg:col-span-2" action={<Link href="/platform/support" className="text-[13px] font-medium text-brand hover:underline">Full queue</Link>}>
      <QueueList empty="The queue is clear." items={support.oldest.map((c) => ({
        href: `/platform/support/${c.id}`, title: c.subject, detail: `${c.org} · ${c.priority}${c.assignee ? ` · ${c.assignee}` : ' · unassigned'}`,
        note: ageLabel(c.ageHours), noteTone: c.priority === 'urgent' || (c.ageHours ?? 0) > 48 ? 'danger' as const : 'muted' as const,
      }))} />
    </Panel>
  )
  const priorityPanel = support && (
    <Panel title="Queue by priority" action={<span className="text-[12px] text-muted">{support.resolved7d} resolved in 7 days</span>}>
      <FunnelBars rows={(['urgent', 'high', 'normal', 'low'] as const).map((p) => ({ label: humanise(p), value: support.byPriority[p] ?? 0, href: `/platform/support?priority=${p}` }))} />
      {support.expiringGrants.length > 0 && (
        <div className="mt-5 border-t border-default pt-4">
          <p className="mb-2 text-[12px] font-medium text-muted">Support access ending within 24 h</p>
          <QueueList empty="" items={support.expiringGrants.map((g) => ({ href: `/platform/organisations/${g.orgId}`, title: g.org, note: when(g.expiresAt), noteTone: 'warn' as const }))} />
        </div>
      )}
    </Panel>
  )
  const renewalsPanel = finance && (
    <Panel title="Renewals in the next 30 days" className="lg:col-span-2">
      <QueueList empty="No renewals due in the next 30 days." items={finance.renewals.map((r) => ({ href: `/platform/organisations/${r.orgId}`, title: r.org, detail: `${r.plan ?? 'Plan'} · ${r.status === 'past_due' ? 'payment overdue' : 'active'}`, note: day(r.endsAt), noteTone: r.status === 'past_due' ? 'danger' as const : 'muted' as const }))} />
    </Panel>
  )
  const activityPanel = (
    <Panel title="Recent staff activity" className="lg:col-span-2" action={act.recent.length ? <Link href="/platform/audit" className="text-[13px] font-medium text-brand hover:underline">Audit log</Link> : undefined}>
      {act.recent.length === 0 ? <p className="py-6 text-center text-[13px] text-muted">No staff actions recorded yet.</p> : (
        <div className="-mx-5 -mb-5 overflow-x-auto">
          <table className="w-full min-w-[520px] text-[13px]">
            <thead><tr><Th>Action</Th><Th>By</Th><Th>On</Th><Th className="text-right">When</Th></tr></thead>
            <tbody>
              {act.recent.map((r) => (
                <tr key={r.id}>
                  <Td className="font-medium">{humanise(r.action)}</Td>
                  <Td className="text-muted">{ROLE_LABEL[r.actor_role as StaffRole] ?? r.actor_role}</Td>
                  <Td><span className="rounded-md bg-surface-hover px-2 py-0.5 text-[12px] text-muted">{humanise(r.target_entity_type)}</span></Td>
                  <Td className="whitespace-nowrap text-right tabular-nums text-muted">{when(r.created_at)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
  const auditPanel = audit && (
    <Panel title="Actions by area, 7 days">
      <FunnelBars rows={audit.byArea.length ? audit.byArea.map(([k, n]) => ({ label: humanise(k), value: n })) : [{ label: 'None', value: 0 }]} />
    </Panel>
  )
  const revenueKpis = (
    <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="Monthly recurring revenue" value={inr(f.mrrPaise)} icon={IndianRupee} tone="highlight" hint="Contracted prices, before GST" />
      <KpiCard label="Paying subscriptions" value={f.subscriptions.paying} icon={BadgeIndianRupee} tone="good" hint={`${f.subscriptions.trial} on trial · ${f.subscriptions.trialsEndingThisWeek} ending this week`} />
      <KpiCard label="Customer workspaces" value={f.organisations.developer + f.organisations.agency} icon={Building2} hint={`${f.organisations.developer} developers · ${f.organisations.agency} agencies`} href="/platform/organisations" />
      {finance
        ? <KpiCard label="Payment success, 7 days" value={finance.successRate7d === null ? '—' : `${finance.successRate7d}%`} icon={Users} tone={finance.successRate7d !== null && finance.successRate7d < 80 ? 'bad' : 'neutral'} hint={`${finance.failed7d} failed or expired`} href="/platform/payments" />
        : <KpiCard label="Read-only workspaces" value={f.organisations.readOnly} icon={Users} tone={f.organisations.readOnly ? 'bad' : 'neutral'} />}
    </section>
  )

  const grid = (...nodes: React.ReactNode[]) => <div className="grid gap-4 lg:grid-cols-3">{nodes}</div>
  const body: Record<StaffRole, React.ReactNode> = {
    super_admin: <>{revenueKpis}{grid(healthPanel, healthMix)}{grid(growth, funnelPanel)}{grid(teamPanel, priorityPanel)}{grid(activityPanel, subscriptions)}</>,
    platform_admin: <>{grid(healthPanel, healthMix)}{grid(queuePanel, priorityPanel)}{grid(growth, subscriptions)}</>,
    finance_admin: <>{revenueKpis}{grid(renewalsPanel, subscriptions)}{grid(healthPanel, healthMix)}</>,
    sales_manager: <>{grid(teamPanel, websitePanel)}{grid(growth, funnelPanel)}{grid(myFollowUps, subscriptions)}</>,
    sales_rep: <>{grid(myFollowUps, funnelPanel)}{grid(growth, websitePanel)}</>,
    support_agent: <>{grid(queuePanel, priorityPanel)}{grid(healthPanel, healthMix)}</>,
    auditor: <>{grid(activityPanel, auditPanel)}{revenueKpis}{grid(healthPanel, healthMix)}</>,
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">{greeting()}, {access.label.split(/[\s@]/)[0]}</h1>
        <p className="mt-1 text-[13px] text-muted">{ROLE_LABEL[role]} · {FOCUS_LINE[role]}</p>
      </div>
      <section aria-label="Needs you first" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">{focus[role]}</section>
      {body[role]}
    </div>
  )
}
