// app/(dashboard)/[orgSlug]/performance/team/page.tsx — Team overview: how everyone who sells is doing, for owners,
// admins and managers (everyone) and team leads (their team). Where a manager starts in Performance: assignments,
// contacts, visits, conversions, revenue, targets and achievements per person, what needs attention, and a way into
// each person's full page. Read from the event ledger and live lead state (lib/dal/team-overview.ts).
import { rankTeams } from '@/lib/teams/structure'
import { listTeamStructure, teamPerformance } from '@/lib/dal/teams'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, ArrowRight, CalendarClock, PhoneCall, UserX } from 'lucide-react'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { teamProfileIdsOf } from '@/lib/dal/viewer'
import { getSalesStructure } from '@/lib/dal/sales-structure'
import { getTeamOverview, OVERVIEW_PERIODS, type OverviewPeriod } from '@/lib/dal/team-overview'
import { fmtAmount } from '@/lib/dal/performance'
import { canManagePerformance } from '@/lib/performance/rules'
import { sellsPersonally, watchesTeam } from '@/lib/sales/structure'
import { PageShell } from '@/components/layout/PageShell'
import { Badge, EmptyState, Tilt } from '@/components/ui'
import { PerformanceTabs } from '@/components/performance/PerformanceTabs'
import { CountUp } from '@/components/performance/visuals'
import { cn } from '@/lib/utils/cn'

export const metadata: Metadata = { title: 'Team performance' }
export const dynamic = 'force-dynamic'

const ROLE_LABEL: Record<string, string> = { owner: 'Owner', admin: 'Admin', manager: 'Manager', team_lead: 'Team lead', sales_exec: 'Sales' }

export default async function TeamOverviewPage({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ period?: string; team?: string }> }) {
  const { orgSlug } = await params
  const sp = await searchParams
  const { org, role, profile } = await getVerifiedWorkspace(orgSlug)
  if (!watchesTeam(role)) notFound()
  const period: OverviewPeriod = sp.period && sp.period in OVERVIEW_PERIODS ? (sp.period as OverviewPeriod) : 'month'
  const visible = role === 'team_lead' ? await teamProfileIdsOf(org.id, profile.id) : null
  const sales = await getSalesStructure(org.id)
  // Team structure: compare the teams, and narrow the people to one team (?team=).
  const allTeams = sales.teamsEnabled ? (await listTeamStructure(org.id)).filter((t) => t.isActive && (!visible || t.leader?.id === profile.id || t.members.some((m) => visible.includes(m.id)))) : []
  const team = sp.team ? allTeams.find((t) => t.id === sp.team) ?? null : null
  const only = team ? team.members.map((m) => m.id).filter((id) => !visible || visible.includes(id)) : visible
  const o = await getTeamOverview(org.id, period, only)
  const teamRows = allTeams.length ? await (async () => {
    const perf = await teamPerformance(org.id, allTeams, { from: o.from, to: o.to })
    return rankTeams(allTeams.map((t) => ({ id: t.id, name: t.name, leader: t.leader?.name ?? null, totals: perf.get(t.id)!.period })))
  })() : []
  const t = o.totals
  const href = (p: OverviewPeriod, t: string | null = team?.id ?? null) => `/${orgSlug}/performance/team?period=${p}${t ? `&team=${t}` : ''}`
  const tiles = [
    { label: 'Leads assigned', value: t.assigned },
    { label: 'Contacted', value: t.contacted },
    { label: 'Site visits', value: t.visits },
    { label: 'Deals closed', value: t.closed },
    { label: 'Conversion', value: t.conversionPct, suffix: '%', hint: t.assigned ? 'deals ÷ leads assigned' : 'no leads assigned' },
    { label: 'Revenue', value: t.revenue, money: true },
  ]
  const attention = [
    { label: 'Waiting for a first call', value: t.waitingFirstCall, icon: PhoneCall, href: `/${orgSlug}/leads?focus=waiting` },
    { label: 'Follow-ups overdue', value: t.overdueFollowUps, icon: CalendarClock, href: `/${orgSlug}/calendar?view=agenda&person=team` },
    ...(only ? [] : [{ label: 'Nobody assigned', value: o.unassigned, icon: UserX, href: `/${orgSlug}/leads?focus=unassigned` }]),
  ]

  return (
    <PageShell title={role === 'team_lead' ? 'My team' : 'Team performance'}
      description={role === 'team_lead' ? 'How your team is doing, person by person.' : 'Everyone who sells, side by side: assignments, contacts, visits, conversions and achievements.'}>
      <PerformanceTabs orgSlug={orgSlug} current="team" canManage={canManagePerformance(role)} watchesTeam sellsPersonally={sellsPersonally(role, sales)} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Period" className="surface-raised inline-flex rounded-xl border border-default bg-surface p-0.5 text-[13px]">
          {(Object.keys(OVERVIEW_PERIODS) as OverviewPeriod[]).map((p) => (
            <Link key={p} href={href(p)} aria-current={p === period ? 'page' : undefined}
              className={cn('rounded-lg px-3 py-1.5', p === period ? 'bg-brand-light font-medium text-brand' : 'text-muted hover:text-foreground')}>{OVERVIEW_PERIODS[p]}</Link>
          ))}
        </nav>
        {sales.teamsEnabled && teamRows.length === 0 && role !== 'team_lead' && <Link href={`/${orgSlug}/teams`} className="text-[13px] font-medium text-brand">Set up teams →</Link>}
        {role === 'owner' && !sales.ownerSells && (
          <p className="text-[12px] text-muted">You manage and are not on the sales board. <Link href={`/${orgSlug}/settings/sales`} className="font-medium text-brand">Change in Settings</Link></p>
        )}
      </div>

      <div className="stagger grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((x) => (
          <Tilt key={x.label} className="surface-raised rounded-2xl border border-default bg-surface p-4">
            <p className="text-[12px] font-medium text-muted">{x.label}</p>
            <p className="mt-1 text-[24px] font-bold tabular-nums text-foreground [transform:translateZ(20px)]">
              {x.value === null ? '—' : x.money ? fmtAmount('revenue', x.value) : <><CountUp value={x.value} />{x.suffix ?? ''}</>}
            </p>
            {x.hint && <p className="text-[11px] text-subtle">{x.hint}</p>}
          </Tilt>
        ))}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {attention.map((a) => (
          <Link key={a.label} href={a.href} className={cn('lift surface-raised flex items-center gap-3 rounded-2xl border bg-surface p-4', a.value > 0 ? 'border-warning' : 'border-default')}>
            <span className={cn('grid size-10 place-items-center rounded-xl', a.value > 0 ? 'bg-warning-bg text-warning' : 'bg-surface-hover text-subtle')}><a.icon aria-hidden className="size-5" /></span>
            <span className="min-w-0 flex-1"><span className="block text-[12px] text-muted">{a.label}</span><span className="block text-[20px] font-bold tabular-nums text-foreground">{a.value}</span></span>
            <ArrowRight aria-hidden className="size-4 text-subtle" />
          </Link>
        ))}
      </div>

      {teamRows.length > 0 && (
        <section aria-labelledby="teams-compare" className="mt-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 id="teams-compare" className="text-[15px] font-semibold text-foreground">Teams · {OVERVIEW_PERIODS[period].toLowerCase()}</h2>
            <Link href={`/${orgSlug}/teams`} className="text-[13px] font-medium text-brand">Manage teams</Link>
          </div>
          <ul className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {teamRows.map((t) => (
              <li key={t.id}>
                <Link href={href(period, team?.id === t.id ? null : t.id)} aria-current={team?.id === t.id ? 'true' : undefined}
                  className={cn('lift surface-raised flex items-center gap-3 rounded-2xl border bg-surface p-4', team?.id === t.id ? 'border-brand' : 'border-default')}>
                  <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl text-[14px] font-bold', t.rank === 1 ? 'medal-lit bg-warning-bg text-warning' : 'bg-surface-hover text-muted')}>#{t.rank}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-foreground">{t.name}</span>
                    <span className="block text-[12px] text-muted">{t.totals.members} {t.totals.members === 1 ? 'person' : 'people'}{t.leader ? ` · led by ${t.leader}` : ''}</span>
                  </span>
                  <span className="text-right text-[12px] tabular-nums text-muted">
                    <span className="block text-[16px] font-bold text-foreground">{t.totals.closed}</span>closed · {fmtAmount('revenue', t.totals.revenue)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="people" className="mt-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 id="people" className="text-[15px] font-semibold text-foreground">{team ? `${team.name} · ` : 'People · '}{OVERVIEW_PERIODS[period].toLowerCase()}{team && <Link href={href(period, null)} className="ml-2 text-[12px] font-normal text-brand">Show everyone</Link>}</h2>
          <Link href={`/${orgSlug}/performance/leaderboard`} className="text-[13px] font-medium text-brand">Leaderboard</Link>
        </div>
        {o.rows.length === 0 ? (
          <div className="surface-raised rounded-2xl border border-default bg-surface"><EmptyState icon={AlertTriangle} title="Nobody is selling yet" description="Invite salespeople from Team, or let the owner sell in Settings → Sales structure." /></div>
        ) : (
          <>
            {/* Larger screens: one row per person. */}
            <div className="surface-raised hidden overflow-x-auto rounded-2xl border border-default bg-surface md:block">
              <table className="w-full text-left text-[13px]">
                <thead className="border-b border-default text-[11px] uppercase tracking-wide text-subtle">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Person</th>
                    <th className="px-3 py-3 text-right font-semibold">Assigned</th><th className="px-3 py-3 text-right font-semibold">Contacted</th>
                    <th className="px-3 py-3 text-right font-semibold">Follow-ups</th><th className="px-3 py-3 text-right font-semibold">Visits</th>
                    <th className="px-3 py-3 text-right font-semibold">Closed</th><th className="px-3 py-3 text-right font-semibold">Conv.</th>
                    <th className="px-3 py-3 text-right font-semibold">Revenue</th><th className="px-3 py-3 text-right font-semibold">Target</th>
                    <th className="px-3 py-3 text-right font-semibold">Badges</th><th className="px-4 py-3 font-semibold">Needs attention</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {o.rows.map((r) => (
                    <tr key={r.profileId} className="hover:bg-surface-hover">
                      <td className="px-4 py-3">
                        <Link href={`/${orgSlug}/performance?person=${r.profileId}`} className="font-medium text-foreground hover:text-brand">{r.name}</Link>
                        <span className="block text-[11px] text-muted">{ROLE_LABEL[r.role] ?? r.role} · {r.level}{r.teams.length ? ` · ${r.teams.join(', ')}` : ''}</span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{r.assigned}</td><td className="px-3 py-3 text-right tabular-nums">{r.contacted}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{r.followUps}</td><td className="px-3 py-3 text-right tabular-nums">{r.visits}</td>
                      <td className="px-3 py-3 text-right font-semibold tabular-nums">{r.closed}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{r.conversionPct === null ? '—' : `${r.conversionPct}%`}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{fmtAmount('revenue', r.revenue)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{r.targetPct === null ? '—' : <Badge tone={r.targetPct >= 100 ? 'success' : r.targetPct >= 60 ? 'brand' : 'warning'}>{r.targetPct}%</Badge>}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{r.achievements}</td>
                      <td className="px-4 py-3"><Attention r={r} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Phones: a card per person. */}
            <ul className="stagger space-y-3 md:hidden">
              {o.rows.map((r) => (
                <li key={r.profileId}>
                  <Link href={`/${orgSlug}/performance?person=${r.profileId}`} className="lift surface-raised block rounded-2xl border border-default bg-surface p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0"><p className="font-semibold text-foreground">{r.name}</p><p className="text-[12px] text-muted">{ROLE_LABEL[r.role] ?? r.role} · {r.level}</p></div>
                      {r.targetPct !== null && <Badge tone={r.targetPct >= 100 ? 'success' : r.targetPct >= 60 ? 'brand' : 'warning'}>{r.targetPct}% of target</Badge>}
                    </div>
                    <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
                      {[['Assigned', r.assigned], ['Contacted', r.contacted], ['Visits', r.visits], ['Closed', r.closed]].map(([l, v]) => (
                        <div key={l as string} className="rounded-lg bg-surface-muted py-2"><dt className="text-[11px] text-muted">{l}</dt><dd className="text-[16px] font-bold tabular-nums text-foreground">{v}</dd></div>
                      ))}
                    </dl>
                    <div className="mt-2"><Attention r={r} /></div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </PageShell>
  )
}

function Attention({ r }: { r: { waitingFirstCall: number; overdueFollowUps: number; openLeads: number } }) {
  const items = [
    r.waitingFirstCall ? <Badge key="w" tone="warning">{r.waitingFirstCall} waiting for a call</Badge> : null,
    r.overdueFollowUps ? <Badge key="o" tone="danger">{r.overdueFollowUps} overdue</Badge> : null,
  ].filter(Boolean)
  return items.length ? <span className="flex flex-wrap gap-1">{items}</span> : <span className="text-[12px] text-subtle">{r.openLeads} open · on track</span>
}
