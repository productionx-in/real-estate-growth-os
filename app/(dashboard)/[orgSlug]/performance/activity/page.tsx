// app/(dashboard)/[orgSlug]/performance/activity/page.tsx — the sales activity feed (20260101): bookings, targets reached,
// achievements, trophies, rewards and a new leader on the board, as they happen, with reactions. Built from the CRM's
// own records; customers are never named. The workspace decides who sees it, whether booking values show and whether
// reactions are on (Performance → Targets & settings).
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Activity } from 'lucide-react'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getSalesStructure } from '@/lib/dal/sales-structure'
import { getGamification } from '@/lib/dal/performance'
import { getFeed } from '@/lib/dal/feed'
import { isManagement } from '@/lib/auth/permissions'
import { canManagePerformance } from '@/lib/performance/rules'
import { canSeeFeed, seesAmounts } from '@/lib/feed/items'
import { sellsPersonally, watchesTeam } from '@/lib/sales/structure'
import { PageShell } from '@/components/layout/PageShell'
import { PerformanceTabs } from '@/components/performance/PerformanceTabs'
import { EmptyState } from '@/components/ui'
import { ActivityFeed } from '@/components/feed/ActivityFeed'

export const metadata: Metadata = { title: 'Activity' }
export const dynamic = 'force-dynamic'

export default async function ActivityPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { org, role, profile } = await getVerifiedWorkspace(orgSlug)
  if (role === 'readonly' || role === 'post_sales') notFound()
  const [s, sales] = await Promise.all([getGamification(org.id), getSalesStructure(org.id)])
  const manager = isManagement(role)
  const tabs = <PerformanceTabs orgSlug={orgSlug} current="activity" canManage={canManagePerformance(role)} watchesTeam={watchesTeam(role)} sellsPersonally={sellsPersonally(role, sales)} />
  if (!canSeeFeed(s, manager)) {
    return (
      <PageShell title="Activity" description="Wins across the team as they happen.">
        {tabs}
        <div className="surface-raised rounded-2xl border border-default bg-surface">
          <EmptyState icon={Activity} title={s.feed.enabled && s.enabled ? 'Shared with managers only' : 'The activity feed is off'}
            description={canManagePerformance(role) ? 'Switch it on, and choose who sees it, in Targets & settings.' : 'Your workspace has not shared the activity feed with everyone.'} />
        </div>
      </PageShell>
    )
  }
  const items = await getFeed(org.id, profile.id, { amounts: seesAmounts(s, manager), leaderboard: manager || s.leaderboard.visibleTo === 'everyone' })
  return (
    <PageShell title="Activity" description="Bookings, targets, achievements, trophies and rewards across the team, as they happen. Customers are never named.">
      {tabs}
      <ActivityFeed orgId={org.id} initial={items} reactions={s.feed.reactions} />
    </PageShell>
  )
}
