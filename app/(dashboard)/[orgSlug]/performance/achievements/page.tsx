// app/(dashboard)/[orgSlug]/performance/achievements/page.tsx — the Achievement Centre: every badge the workspace offers,
// unlocked ones lit with their date, locked ones dimmed with how close the person is. Unlocking is the database's job,
// from real events (20260094); nothing here can award anything.
import { listTeamStructure, teamPerformance } from '@/lib/dal/teams'
import { teamProfileIdsOf } from '@/lib/dal/viewer'
import { getTeamUnlocks } from '@/lib/dal/team-overview'
import { sellsPersonally, watchesTeam } from '@/lib/sales/structure'
import { getSalesStructure } from '@/lib/dal/sales-structure'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Gift, Trophy as TrophyIcon } from 'lucide-react'
import { latestWinners, periodLabel, trophiesFor, type Trophy } from '@/lib/dal/trophies'
import { fmtDeals } from '@/lib/sales/deal-credit'
import { cn } from '@/lib/utils/cn'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getAchievements } from '@/lib/dal/performance'
import { METRICS, canManagePerformance } from '@/lib/performance/rules'
import { PageShell } from '@/components/layout/PageShell'
import { PerformanceTabs } from '@/components/performance/PerformanceTabs'
import { Medal } from '@/components/performance/visuals'

export const metadata: Metadata = { title: 'Achievements' }
export const dynamic = 'force-dynamic'

const WINDOW = { all: '', week: ' in one week', month: ' in one month' } as const
const METRIC_TEXT: Record<string, string> = { ...Object.fromEntries(Object.entries(METRICS).map(([k, v]) => [k, v.label.toLowerCase()])), missions: 'daily missions', targets: 'targets reached', xp: 'points' }
const ONE: Record<string, string> = { assigned: 'lead assigned', contacted: 'lead contacted', follow_ups: 'follow-up completed', meetings: 'site visit completed', closed: 'deal closed', missions: 'daily mission', targets: 'target reached', xp: 'point' }

export default async function AchievementsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { org, role, profile } = await getVerifiedWorkspace(orgSlug)
  const sales = await getSalesStructure(org.id)
  if (role === 'readonly' || role === 'post_sales') notFound()
  const mine = sellsPersonally(role, sales)
  const team = watchesTeam(role) ? await getTeamUnlocks(org.id, role === 'team_lead' ? await teamProfileIdsOf(org.id, profile.id) : null) : null
  // A manager who does not sell sees the team's badges (who holds each), not a personal collection.
  const all = (await getAchievements(org.id, mine ? profile.id : null)).filter((a) => a.active)
  // Team structure: each team's milestones (its current members' all-time work). A team lead sees their teams.
  const teamList = sales.teamsEnabled ? (await listTeamStructure(org.id)).filter((t) => t.isActive && (watchesTeam(role) && role !== 'team_lead' ? true : t.leader?.id === profile.id || t.members.some((m) => m.id === profile.id))) : []
  const teamAch = teamList.length ? await teamPerformance(org.id, teamList, { from: new Date(0), to: new Date() }) : null
  // Weekly challenges and monthly achievements start again each period; the rest are once only.
  const challenges = all.filter((a) => a.window === 'week'), monthly = all.filter((a) => a.window === 'month')
  const once = all.filter((a) => a.window === 'all')
  const unlocked = once.filter((a) => a.unlockedAt).sort((a, b) => (b.unlockedAt ?? '').localeCompare(a.unlockedAt ?? ''))
  const locked = once.filter((a) => !a.unlockedAt).sort((a, b) => b.progress - a.progress)
  // Trophies: a seller's own and their teams'; a manager who does not sell sees the latest winners.
  const myTeamIds = teamList.filter((t) => t.members.some((m) => m.id === profile.id) || t.leader?.id === profile.id).map((t) => t.id)
  const cabinet = mine ? await trophiesFor(org.id, profile.id, myTeamIds) : null
  const winners = mine ? null : await latestWinners(org.id)
  const criteria = (a: (typeof all)[number]) => a.metric === 'revenue'
    ? `Close ₹${a.threshold.toLocaleString('en-IN')} of bookings${WINDOW[a.window]}`
    : `${a.threshold.toLocaleString('en-IN')} ${(a.threshold === 1 ? ONE[a.metric] : METRIC_TEXT[a.metric]) ?? a.metric}${WINDOW[a.window]}`

  return (
    <PageShell title="Achievements" description={mine ? `${unlocked.length} of ${once.length} badges unlocked. Each one comes from real work — keep going for the rest.` : 'What your team has earned. Every badge comes from real work in RE by PX.'}>
      <PerformanceTabs orgSlug={orgSlug} current="achievements" canManage={canManagePerformance(role)} watchesTeam={watchesTeam(role)} sellsPersonally={sellsPersonally(role, sales)} />
      {team && (
        <section aria-labelledby="team-unlocks" className="surface-raised mb-8 rounded-2xl border border-default bg-surface p-5">
          <h2 id="team-unlocks" className="text-[14px] font-semibold text-foreground">{role === 'team_lead' ? 'Your team’s latest' : 'Team’s latest'}</h2>
          {team.recent.length === 0 ? <p className="mt-1 text-[13px] text-muted">No badges yet. They arrive with the first calls, visits and bookings.</p> : (
            <ul className="mt-2 divide-y divide-[var(--border)]">
              {team.recent.map((r, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                  <span><span className="font-medium text-foreground">{r.name}</span> <span className="text-muted">unlocked</span> <span className="font-medium text-foreground">{r.title}</span></span>
                  <span className="shrink-0 text-[12px] text-subtle">{new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(r.at))}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {cabinet && (
        <section aria-labelledby="cabinet" className="mb-8">
          <h2 id="cabinet" className="mb-3 text-[14px] font-semibold text-foreground">Trophy cabinet</h2>
          {cabinet.length === 0
            ? <p className="surface-raised rounded-2xl border border-default bg-surface p-5 text-[13px] text-muted">Finish a week or a month in the top three of the leaderboard to win a trophy. They are awarded the day after it ends.</p>
            : <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">{cabinet.map((t) => <TrophyCard key={t.id} t={t} />)}</div>}
        </section>
      )}
      {winners && (winners.week.length > 0 || winners.month.length > 0) && (
        <section aria-labelledby="winners" className="mb-8">
          <h2 id="winners" className="mb-3 text-[14px] font-semibold text-foreground">Latest trophy winners</h2>
          <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">{[...winners.week, ...winners.month].map((t) => <TrophyCard key={t.id} t={t} showName />)}</div>
        </section>
      )}
      {challenges.length > 0 && (
        <section aria-labelledby="challenges" className="mb-8">
          <h2 id="challenges" className="text-[14px] font-semibold text-foreground">This week’s challenges</h2>
          <p className="mb-3 text-[12px] text-muted">They start again every Monday{mine ? ` · ${challenges.filter((a) => a.doneThisPeriod).length} of ${challenges.length} done this week` : ''}.</p>
          <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {challenges.map((a) => (
              <div key={a.key}>
                <Medal icon={a.icon} title={a.title.replace(/^Weekly challenge: /, '')} description={a.description || criteria(a)} unlocked={mine && a.doneThisPeriod} progress={mine ? a.progress : 0} xp={a.xp} times={a.times} />
                {team && <p className="mt-1.5 text-center text-[11px] text-muted">{team.holders.get(a.key) ? `Won ${team.holders.get(a.key)} ${team.holders.get(a.key) === 1 ? 'time' : 'times'} by the team` : 'Not won yet'}</p>}
                {a.rewardNote && <p className="mt-1.5 flex items-center justify-center gap-1 text-center text-[11px] text-muted"><Gift className="size-3" aria-hidden /> {a.rewardNote}</p>}
              </div>
            ))}
          </div>
        </section>
      )}
      {monthly.length > 0 && (
        <section aria-labelledby="monthly" className="mb-8">
          <h2 id="monthly" className="text-[14px] font-semibold text-foreground">This month</h2>
          <p className="mb-3 text-[12px] text-muted">Monthly achievements start again on the 1st.</p>
          <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {monthly.map((a) => (
              <div key={a.key}>
                <Medal icon={a.icon} title={a.title} description={a.description || criteria(a)} unlocked={mine && a.doneThisPeriod} progress={mine ? a.progress : 0} xp={a.xp} times={a.times} />
                {a.rewardNote && <p className="mt-1.5 flex items-center justify-center gap-1 text-center text-[11px] text-muted"><Gift className="size-3" aria-hidden /> {a.rewardNote}</p>}
              </div>
            ))}
          </div>
        </section>
      )}
      {mine && unlocked.length > 0 && (
        <section aria-labelledby="unlocked" className="mb-8">
          <h2 id="unlocked" className="mb-3 text-[14px] font-semibold text-foreground">Unlocked</h2>
          <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {unlocked.map((a) => (
              <div key={a.key}>
                <Medal icon={a.icon} title={a.title} description={a.description || criteria(a)} unlocked progress={1} xp={a.xp} times={a.times} unlockedAt={a.unlockedAt} />
                {a.rewardNote && <p className="mt-1.5 flex items-center justify-center gap-1 text-center text-[11px] text-muted"><Gift className="size-3" aria-hidden /> {a.rewardNote}</p>}
              </div>
            ))}
          </div>
        </section>
      )}
      {teamAch && (
        <section aria-labelledby="team-ach" className="mb-8">
          <h2 id="team-ach" className="mb-3 text-[14px] font-semibold text-foreground">Team achievements</h2>
          <div className="stagger grid gap-3 md:grid-cols-2">
            {teamList.map((t) => {
              const a = teamAch.get(t.id)!.achievements
              return (
                <div key={t.id} className="surface-raised rounded-2xl border border-default bg-surface p-4">
                  <p className="font-semibold text-foreground">{t.name} <span className="text-[12px] font-normal text-muted">· {a.filter((x) => x.unlocked).length} of {a.length}</span></p>
                  <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                    {a.map((x) => (
                      <li key={x.key} className="text-[12px]">
                        <span className={x.unlocked ? 'font-medium text-warning' : 'text-muted'}>{x.unlocked ? '★ ' : ''}{x.title}</span>
                        {!x.unlocked && <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-hover" aria-hidden><span className="block h-full rounded-full bg-brand" style={{ width: `${Math.round(x.progress * 100)}%` }} /></span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </section>
      )}
      <section aria-labelledby="locked">
        <h2 id="locked" className="mb-3 text-[14px] font-semibold text-foreground">{!mine ? 'All badges' : unlocked.length ? 'Still to unlock' : 'Your achievements'}</h2>
        <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {locked.map((a) => (
            <div key={a.key}>
              <Medal icon={a.icon} title={a.title} description={criteria(a)} unlocked={false} progress={mine ? a.progress : 0} xp={a.xp} />
              {team && <p className="mt-1.5 text-center text-[11px] text-muted">{team.holders.get(a.key) ? `${team.holders.get(a.key)} ${team.holders.get(a.key) === 1 ? 'person has' : 'people have'} it` : 'Nobody yet'}</p>}
              {a.rewardNote && <p className="mt-1.5 flex items-center justify-center gap-1 text-center text-[11px] text-muted"><Gift className="size-3" aria-hidden /> {a.rewardNote}</p>}
            </div>
          ))}
        </div>
      </section>
      <p className="mt-6 text-[12px] text-subtle">Rewards beyond points are only what your workspace has written next to a badge; RE by PX promises none itself.</p>
    </PageShell>
  )
}

const PLACE = { 1: { label: 'Gold', tone: 'text-warning' }, 2: { label: 'Silver', tone: 'text-muted' }, 3: { label: 'Bronze', tone: 'text-danger' } } as const

/** One trophy: place, period, and the frozen winning numbers. */
function TrophyCard({ t, showName = false }: { t: Trophy; showName?: boolean }) {
  const p = PLACE[t.place]
  return (
    <div className="surface-raised flex flex-col items-center rounded-2xl border border-default bg-surface p-4 text-center">
      <span className={cn('grid size-12 place-items-center rounded-full bg-surface-muted', p.tone)}><TrophyIcon className="size-6" aria-hidden /></span>
      <p className="mt-2 text-[13px] font-semibold text-foreground">{p.label}{t.scope === 'team' ? ' · team' : ''}</p>
      <p className="text-[12px] text-muted">{periodLabel(t)}</p>
      {(showName || t.scope === 'team') && <p className="mt-1 truncate text-[12px] font-medium text-foreground" title={t.name}>{t.name}</p>}
      <p className="mt-1 text-[11px] text-subtle">{t.xp.toLocaleString('en-IN')} XP{t.closed ? ` · ${fmtDeals(t.closed)} deals` : ''}</p>
    </div>
  )
}
