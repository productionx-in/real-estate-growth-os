// app/(dashboard)/[orgSlug]/performance/achievements/page.tsx — the Achievement Centre: every badge the workspace offers,
// unlocked ones lit with their date, locked ones dimmed with how close the person is. Unlocking is the database's job,
// from real events (20260094); nothing here can award anything.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Gift } from 'lucide-react'
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
  if (role === 'readonly' || role === 'post_sales') notFound()
  const all = (await getAchievements(org.id, profile.id)).filter((a) => a.active)
  const unlocked = all.filter((a) => a.unlockedAt).sort((a, b) => (b.unlockedAt ?? '').localeCompare(a.unlockedAt ?? ''))
  const locked = all.filter((a) => !a.unlockedAt).sort((a, b) => b.progress - a.progress)
  const criteria = (a: (typeof all)[number]) => a.metric === 'revenue'
    ? `Close ₹${a.threshold.toLocaleString('en-IN')} of bookings${WINDOW[a.window]}`
    : `${a.threshold.toLocaleString('en-IN')} ${(a.threshold === 1 ? ONE[a.metric] : METRIC_TEXT[a.metric]) ?? a.metric}${WINDOW[a.window]}`

  return (
    <PageShell title="Achievements" description={`${unlocked.length} of ${all.length} unlocked. Each one comes from real work — keep going for the rest.`}>
      <PerformanceTabs orgSlug={orgSlug} current="achievements" canManage={canManagePerformance(role)} />
      {unlocked.length > 0 && (
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
      <section aria-labelledby="locked">
        <h2 id="locked" className="mb-3 text-[14px] font-semibold text-foreground">{unlocked.length ? 'Still to unlock' : 'Your achievements'}</h2>
        <div className="stagger grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {locked.map((a) => (
            <div key={a.key}>
              <Medal icon={a.icon} title={a.title} description={criteria(a)} unlocked={false} progress={a.progress} xp={a.xp} />
              {a.rewardNote && <p className="mt-1.5 flex items-center justify-center gap-1 text-center text-[11px] text-muted"><Gift className="size-3" aria-hidden /> {a.rewardNote}</p>}
            </div>
          ))}
        </div>
      </section>
      <p className="mt-6 text-[12px] text-subtle">Rewards beyond points are only what your workspace has written next to a badge; REGrow promises none itself.</p>
    </PageShell>
  )
}
