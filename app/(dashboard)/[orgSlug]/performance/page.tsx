// app/(dashboard)/[orgSlug]/performance/page.tsx — My performance: level and points, what to do next, today's missions,
// targets, the numbers that matter and recent achievements. Everyone who sells sees their own; owners, admins and
// managers can look at anyone's (?person=). Read from the event ledger (20260094), never typed in.
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, Lightbulb, Sparkles } from 'lucide-react'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { fmtAmount, getMyPerformance } from '@/lib/dal/performance'
import { isManagement } from '@/lib/auth/permissions'
import { METRICS, PERIODS, canManagePerformance } from '@/lib/performance/rules'
import { createServiceClient } from '@/lib/supabase/server'
import { PageShell } from '@/components/layout/PageShell'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Tilt } from '@/components/ui'
import { PerformanceTabs } from '@/components/performance/PerformanceTabs'
import { Bar, CountUp, LevelRing, Medal, XpHistory } from '@/components/performance/visuals'

export const metadata: Metadata = { title: 'My performance' }
export const dynamic = 'force-dynamic'

export default async function MyPerformancePage({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ person?: string }> }) {
  const { orgSlug } = await params
  const sp = await searchParams
  const { org, role, profile } = await getVerifiedWorkspace(orgSlug)
  if (role === 'readonly' || role === 'post_sales') notFound()
  let personId = profile.id, personName: string | null = null
  if (sp.person && sp.person !== profile.id && /^[0-9a-f-]{36}$/.test(sp.person)) {
    if (!isManagement(role)) notFound()
    const { data } = await createServiceClient().from('org_members').select('profile_id, profiles!org_members_profile_id_fkey(full_name)').eq('org_id', org.id).eq('profile_id', sp.person).maybeSingle()
    if (!data) notFound()
    personId = sp.person
    personName = (data as unknown as { profiles: { full_name: string | null } | null }).profiles?.full_name ?? 'Team member'
  }
  const p = await getMyPerformance(org.id, personId)
  const own = personId === profile.id
  const tiles: { label: string; value: number; metric?: keyof typeof METRICS; hint: string; href?: string }[] = [
    { label: 'Waiting for a first call', value: p.pendingContacts, hint: 'assigned, not contacted yet', href: own ? `/${orgSlug}/leads?focus=waiting` : undefined },
    { label: 'Contacted this week', value: p.week.contacted, hint: `${p.today.contacted} today` },
    { label: 'Follow-ups done this week', value: p.week.follow_ups, hint: `${p.upcomingFollowUps} coming up`, href: own ? `/${orgSlug}/today` : undefined },
    { label: 'Site visits this month', value: p.month.meetings, hint: `${p.week.meetings} this week` },
    { label: 'Deals closed this month', value: p.month.closed, hint: p.conversionPct === null ? 'no leads assigned this month' : `${p.conversionPct}% of leads assigned this month` },
    { label: 'Revenue this month', value: p.month.revenue, metric: 'revenue', hint: `${p.month.assigned} leads assigned this month` },
  ]

  return (
    <PageShell title={own ? 'My performance' : `Performance · ${personName}`} description={own ? 'Every call, follow-up, visit and booking moves you forward. Points come only from real work in REGrow.' : 'Their progress, read from what they did in REGrow.'}
      back={own ? undefined : { href: `/${orgSlug}/performance/leaderboard`, label: 'Leaderboard' }}>
      <PerformanceTabs orgSlug={orgSlug} current="me" canManage={canManagePerformance(role)} />
      {!p.settings.enabled && (
        <p className="mb-4 rounded-lg border border-default bg-surface-hover px-3 py-2 text-[13px] text-muted">Points and missions are switched off for this workspace. Your numbers and targets still update.</p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Tilt className="surface-raised rounded-2xl border border-default bg-surface p-5 lg:col-span-1">
          <div className="flex items-center gap-4">
            <LevelRing progress={p.level.progress} level={p.level.level.name} index={p.level.index} />
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-muted">Total points</p>
              <p className="text-[30px] font-bold leading-none text-foreground [transform:translateZ(24px)]"><CountUp value={p.xp} /> <span className="text-[14px] font-semibold text-muted">XP</span></p>
              <p className="mt-2 text-[12px] text-muted">{p.level.next ? <>{p.level.toNext.toLocaleString('en-IN')} XP to <span className="font-semibold text-foreground">{p.level.next.name}</span></> : 'Top level reached'}</p>
              <p className="mt-1 text-[12px] text-muted">+{p.today.xp} today · +{p.week.xp} this week</p>
            </div>
          </div>
        </Tilt>

        <Card className="lg:col-span-2">
          <CardContent className="flex h-full flex-col gap-4 p-5 sm:flex-row sm:items-center">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand" aria-hidden><Lightbulb className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">Focus next</p>
              <p className="mt-0.5 text-[15px] font-semibold text-foreground">{p.next}</p>
              {p.overallTargetPct !== null && <p className="mt-1 text-[13px] text-muted">Your targets are {p.overallTargetPct}% complete overall.</p>}
            </div>
            {own && p.pendingContacts > 0 && (
              <Link href={`/${orgSlug}/leads?focus=waiting`} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-[13px] font-medium text-brand-foreground hover:bg-brand-hover">Open waiting leads <ArrowRight className="size-4" aria-hidden /></Link>
            )}
          </CardContent>
        </Card>
      </div>

      <section aria-label="Numbers" className="stagger mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t) => {
          const body = (
            <>
              <p className="text-[12px] font-medium text-muted">{t.label}</p>
              <p className="mt-1 text-[24px] font-bold text-foreground [transform:translateZ(20px)]">{t.metric === 'revenue' ? fmtAmount('revenue', t.value) : <CountUp value={t.value} />}</p>
              <p className="text-[11px] text-subtle">{t.hint}</p>
            </>
          )
          return (
            <Tilt key={t.label} className="rounded-xl">
              {t.href ? <Link href={t.href} className="surface-raised block h-full rounded-xl border border-default bg-surface p-4 hover:bg-surface-hover">{body}</Link>
                : <div className="surface-raised h-full rounded-xl border border-default bg-surface p-4">{body}</div>}
            </Tilt>
          )
        })}
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><div><CardTitle>Today’s missions</CardTitle><CardDescription>Small wins that add up. They reset at midnight.</CardDescription></div></CardHeader>
          <CardContent className="space-y-4">
            {p.missions.length === 0 ? <p className="text-[13px] text-muted">No missions today.</p> : p.missions.map((m) => (
              <Bar key={m.key} value={m.done} max={m.count} complete={m.complete}
                label={<>{m.complete && <Sparkles className="mr-1 inline size-3.5 text-success" aria-hidden />}{m.title}</>}
                sub={m.complete ? `Done · +${m.xp} XP` : `${Math.min(m.done, m.count)} / ${m.count} · ${m.xp} XP`} />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><div><CardTitle>Targets</CardTitle><CardDescription>Set by your workspace. Progress updates with every activity.</CardDescription></div></CardHeader>
          <CardContent className="space-y-4">
            {p.targets.length === 0 ? <p className="text-[13px] text-muted">No targets set for you right now.</p> : p.targets.map((t) => (
              <Bar key={t.id} value={t.done} max={t.amount}
                label={`${PERIODS[t.period]} · ${METRICS[t.metric].label}`}
                sub={t.metric === 'revenue' ? `${fmtAmount('revenue', t.done)} of ${fmtAmount('revenue', t.amount)}` : `${t.done} / ${t.amount} · ${t.pct}%`} />
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><div><CardTitle>Points, last 30 days</CardTitle><CardDescription>Hover a day to see its points.</CardDescription></div></CardHeader>
          <CardContent><XpHistory days={p.history} /></CardContent>
        </Card>
        <Card>
          <CardHeader className="items-center">
            <div><CardTitle>Latest achievements</CardTitle></div>
            <Link href={`/${orgSlug}/performance/achievements`} className="text-[12px] font-medium text-brand hover:underline">All →</Link>
          </CardHeader>
          <CardContent>
            {p.recentUnlocks.length === 0 ? (
              <EmptyState icon={Sparkles} title="Your first badge is close" description="Log a call on a new lead to unlock “First contact”." />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {p.recentUnlocks.slice(0, 4).map((u) => <Medal key={u.key + u.unlocked_at} icon="trophy" title={u.title} description="" unlocked progress={1} xp={u.xp} unlockedAt={u.unlocked_at} size="sm" />)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  )
}
