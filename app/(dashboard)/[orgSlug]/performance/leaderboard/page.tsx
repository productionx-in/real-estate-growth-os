// app/(dashboard)/[orgSlug]/performance/leaderboard/page.tsx — the team leaderboard: today, this week, this month or
// custom dates (the workspace's time zone), a top-three podium, everyone's rank, how far each person is from the next
// place and how they moved against the previous period. Friendly by design: what colleagues can see of each other is the
// workspace's choice (Targets & settings → Leaderboard); owners, admins and managers always see everything.
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowDownRight, ArrowUpRight, Crown, Minus } from 'lucide-react'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { fmtAmount, getGamification, getLeaderboard, orgTimezone, type LeaderRow } from '@/lib/dal/performance'
import { isManagement } from '@/lib/auth/permissions'
import { canManagePerformance, periodWindow } from '@/lib/performance/rules'
import { PageShell } from '@/components/layout/PageShell'
import { Card, CardContent, EmptyState, Tilt, Input } from '@/components/ui'
import { PerformanceTabs } from '@/components/performance/PerformanceTabs'
import { cn } from '@/lib/utils/cn'

export const metadata: Metadata = { title: 'Leaderboard' }
export const dynamic = 'force-dynamic'

const PERIOD_TABS = { day: 'Today', week: 'This week', month: 'This month', custom: 'Custom dates' } as const
type P = keyof typeof PERIOD_TABS
const DAY = /^\d{4}-\d{2}-\d{2}$/

function Avatar({ row, size = 36 }: { row: LeaderRow; size?: number }) {
  const initials = row.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
  return row.avatarUrl
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={row.avatarUrl} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
    : <span aria-hidden className="flex shrink-0 items-center justify-center rounded-full bg-brand-light font-semibold text-brand" style={{ width: size, height: size, fontSize: size * 0.36 }}>{initials}</span>
}

export default async function LeaderboardPage({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ p?: string; from?: string; to?: string }> }) {
  const { orgSlug } = await params
  const sp = await searchParams
  const { org, role, profile } = await getVerifiedWorkspace(orgSlug)
  if (role === 'readonly' || role === 'post_sales') notFound()
  const [settings, tz] = await Promise.all([getGamification(org.id), orgTimezone(org.id)])
  const period: P = sp.p && sp.p in PERIOD_TABS ? (sp.p as P) : 'week'
  const now = new Date()
  let window = period === 'custom' ? null : periodWindow(period, now, tz)
  let label: string = PERIOD_TABS[period]
  if (period === 'custom') {
    const from = sp.from && DAY.test(sp.from) ? sp.from : null, to = sp.to && DAY.test(sp.to) ? sp.to : null
    if (from && to && to >= from) {
      const start = periodWindow('day', new Date(`${from}T12:00:00Z`), tz).from, end = periodWindow('day', new Date(`${to}T12:00:00Z`), tz).to
      window = { from: start, to: end }
      const f = (d: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`))
      label = `${f(from)} – ${f(to)}`
    }
  }
  const managers = isManagement(role)
  const everyoneSees = settings.leaderboard.visibleTo === 'everyone'
  const show = managers ? { xp: true, contacted: true, closed: true, revenue: true, target: true } : settings.leaderboard.show
  const rows = window ? await getLeaderboard(org.id, window, now) : []
  const me = rows.find((r) => r.profileId === profile.id)
  const visible = managers || everyoneSees ? rows : rows.filter((r) => r.profileId === profile.id)
  const podium = managers || everyoneSees ? rows.slice(0, 3) : []
  const tzLabel = tz === 'Asia/Kolkata' ? 'India time' : tz

  return (
    <PageShell title="Leaderboard" description={`Friendly competition: points for real work, ranked ${label.toLowerCase()} (${tzLabel}).`}>
      <PerformanceTabs orgSlug={orgSlug} current="leaderboard" canManage={canManagePerformance(role)} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-default bg-background p-0.5 text-[13px]">
          {(Object.keys(PERIOD_TABS) as P[]).map((k) => (
            <Link key={k} href={`/${orgSlug}/performance/leaderboard?p=${k}`} aria-current={k === period ? 'true' : undefined}
              className={cn('rounded-md px-3 py-1.5', k === period ? 'bg-surface font-semibold shadow-sm' : 'text-muted hover:text-foreground')}>{PERIOD_TABS[k]}</Link>
          ))}
        </div>
        {period === 'custom' && (
          <form className="flex flex-wrap items-center gap-2 text-[13px]" action={`/${orgSlug}/performance/leaderboard`}>
            <input type="hidden" name="p" value="custom" />
            <label className="flex items-center gap-1.5 text-muted">From <Input type="date" name="from" defaultValue={sp.from} required /></label>
            <label className="flex items-center gap-1.5 text-muted">to <Input type="date" name="to" defaultValue={sp.to} required /></label>
            <button type="submit" className="btn-primary h-9 rounded-md bg-brand px-3 font-medium text-brand-foreground hover:bg-brand-hover">Show</button>
          </form>
        )}
      </div>

      {!window ? (
        <Card><CardContent><EmptyState icon={Crown} title="Pick the dates" description="Choose a start and an end date to rank that period." /></CardContent></Card>
      ) : rows.length === 0 ? (
        <Card><CardContent><EmptyState icon={Crown} title="No one on the board yet" description="Points appear here as soon as the team calls, follows up, shows sites and books." /></CardContent></Card>
      ) : (
        <>
          {me && (
            <Card className="mb-4 border-brand/40">
              <CardContent className="flex flex-wrap items-center gap-4 p-4">
                <span className="text-[28px] font-bold text-brand tabular-nums">#{me.rank}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-foreground">You, {label.toLowerCase()}: {me.xp.toLocaleString('en-IN')} XP</p>
                  <p className="text-[13px] text-muted">
                    {me.gapToNext === null ? 'You are leading. Keep it up!' : me.gapToNext === 0 ? 'Level with the person above you — one more activity moves you up.' : `${me.gapToNext.toLocaleString('en-IN')} XP behind #${me.rank - 1}.`}
                    {' '}{me.xp > me.previousXp ? `Up ${(me.xp - me.previousXp).toLocaleString('en-IN')} on the previous period.` : me.xp < me.previousXp ? `${(me.previousXp - me.xp).toLocaleString('en-IN')} below the previous period so far.` : ''}
                  </p>
                </div>
                <Link href={`/${orgSlug}/performance`} className="text-[13px] font-medium text-brand hover:underline">What to do next →</Link>
              </CardContent>
            </Card>
          )}

          {podium.length > 0 && (
            <section aria-label="Top three" className="mb-5 grid grid-cols-3 items-end gap-2 sm:gap-4">
              {[1, 0, 2].map((i) => {
                const r = podium[i]
                if (!r) return <div key={i} />
                const place = i + 1
                return (
                  <Tilt key={r.profileId} className={cn('podium-step rounded-2xl', place === 1 ? '' : 'mt-6')} style={{ animationDelay: `${[120, 0, 220][i]}ms` }}>
                    <div className={cn('surface-raised flex flex-col items-center rounded-2xl border bg-surface px-2 text-center',
                      place === 1 ? 'border-warning/50 pb-6 pt-4' : 'border-default pb-4 pt-3', r.profileId === profile.id && 'ring-2 ring-brand')}>
                      {place === 1 && <Crown className="mb-1 size-6 text-warning [transform:translateZ(30px)]" aria-hidden />}
                      <div className="[transform:translateZ(24px)]"><Avatar row={r} size={place === 1 ? 64 : 48} /></div>
                      <p className="mt-2 w-full truncate text-[13px] font-semibold text-foreground sm:text-[14px]">{r.name}</p>
                      <p className="text-[12px] text-muted">{r.xp.toLocaleString('en-IN')} XP</p>
                      <span className={cn('mt-2 flex size-8 items-center justify-center rounded-full text-[14px] font-bold',
                        place === 1 ? 'bg-warning text-warning-foreground' : 'bg-surface-hover text-foreground')}>{place}</span>
                    </div>
                  </Tilt>
                )
              })}
            </section>
          )}

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-[13px]">
                <thead className="text-[12px] text-muted">
                  <tr className="border-b border-default">
                    <th className="px-4 py-2.5 font-medium">Rank</th><th className="px-2 py-2.5 font-medium">Salesperson</th>
                    {show.xp && <th className="px-2 py-2.5 text-right font-medium">XP</th>}
                    {show.contacted && <th className="px-2 py-2.5 text-right font-medium">Contacted</th>}
                    {show.closed && <th className="px-2 py-2.5 text-right font-medium">Closed</th>}
                    {show.revenue && <th className="px-2 py-2.5 text-right font-medium">Revenue</th>}
                    {show.target && <th className="px-2 py-2.5 text-right font-medium">Targets</th>}
                    <th className="px-4 py-2.5 text-right font-medium">vs previous</th>
                  </tr>
                </thead>
                <tbody className="stagger divide-y divide-[var(--border)]">
                  {visible.map((r) => {
                    const delta = r.xp - r.previousXp
                    return (
                      <tr key={r.profileId} className={cn('hover:bg-surface-hover', r.profileId === profile.id && 'bg-brand-light/40')}>
                        <td className="px-4 py-3 font-semibold tabular-nums text-foreground">#{r.rank}</td>
                        <td className="px-2 py-3">
                          {managers ? <Link href={`/${orgSlug}/performance?person=${r.profileId}`} className="flex items-center gap-2.5 hover:underline"><Avatar row={r} size={28} /><span className="font-medium text-foreground">{r.name}</span></Link>
                            : <span className="flex items-center gap-2.5"><Avatar row={r} size={28} /><span className="font-medium text-foreground">{r.name}{r.profileId === profile.id ? ' (you)' : ''}</span></span>}
                        </td>
                        {show.xp && <td className="px-2 py-3 text-right font-semibold tabular-nums">{r.xp.toLocaleString('en-IN')}</td>}
                        {show.contacted && <td className="px-2 py-3 text-right tabular-nums">{r.contacted}</td>}
                        {show.closed && <td className="px-2 py-3 text-right tabular-nums">{r.closed}</td>}
                        {show.revenue && <td className="px-2 py-3 text-right tabular-nums">{fmtAmount('revenue', r.revenue)}</td>}
                        {show.target && <td className="px-2 py-3 text-right tabular-nums">{r.targetPct === null ? '—' : `${r.targetPct}%`}</td>}
                        <td className="px-4 py-3 text-right">
                          <span className={cn('inline-flex items-center gap-0.5 tabular-nums', delta > 0 ? 'text-success' : delta < 0 ? 'text-danger' : 'text-subtle')}>
                            {delta > 0 ? <ArrowUpRight className="size-3.5" aria-hidden /> : delta < 0 ? <ArrowDownRight className="size-3.5" aria-hidden /> : <Minus className="size-3.5" aria-hidden />}
                            {delta === 0 ? 'same' : `${delta > 0 ? '+' : ''}${delta.toLocaleString('en-IN')} XP`}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
          {!managers && !everyoneSees && <p className="mt-3 text-[12px] text-muted">Your workspace shows each person only their own place on the board.</p>}
          <p className="mt-3 text-[12px] text-subtle">Points come from first contacts, follow-ups, site visits, bookings, missions and targets. Assignments earn nothing; un-booked deals are taken back.</p>
        </>
      )}
    </PageShell>
  )
}
