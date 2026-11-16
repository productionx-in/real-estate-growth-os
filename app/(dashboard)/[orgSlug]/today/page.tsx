// app/(dashboard)/[orgSlug]/today/page.tsx
// "Today": the salesperson's working list — new leads waiting for a first call, overdue follow-ups, and today's
// follow-ups. Managers see the whole team by default and can switch to their own list.
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AlarmClock, CalendarCheck, PhoneIncoming } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getMyDay } from '@/lib/dal/follow-ups'
import { TodayList } from '@/components/today/TodayList'

export const metadata: Metadata = { title: 'Today' }
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ view?: string }>
}

export default async function TodayPage({ params, searchParams }: PageProps) {
  const { orgSlug } = await params
  const { view } = await searchParams
  const { org, role, profile, isManager } = await getVerifiedWorkspace(orgSlug)
  if (role === 'readonly') redirect(`/${orgSlug}`)

  const team = isManager && view !== 'mine'
  const day = await getMyDay(org.id, team ? null : profile.id)

  const sections = [
    { key: 'waiting' as const, title: 'Call now', hint: 'New leads nobody has contacted yet', icon: PhoneIncoming, tone: 'text-red-600 bg-red-50', leads: day.waiting },
    { key: 'overdue' as const, title: 'Overdue follow-ups', hint: 'Promised calls that slipped', icon: AlarmClock, tone: 'text-amber-700 bg-amber-50', leads: day.overdue },
    { key: 'today' as const, title: 'Later today', hint: 'Follow-ups due before midnight', icon: CalendarCheck, tone: 'text-blue-700 bg-blue-50', leads: day.today },
  ]
  const total = day.waiting.length + day.overdue.length + day.today.length

  return (
    <PageShell
      title="Today"
      description={total === 0 ? 'Nothing waiting — every lead has been contacted and every follow-up is on time.' : `${total} lead${total === 1 ? '' : 's'} need${total === 1 ? 's' : ''} attention`}
      actions={isManager ? (
        <div role="tablist" aria-label="Whose list" className="inline-flex p-0.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[12px]">
          <Link role="tab" aria-selected={team} href={`/${orgSlug}/today`} className={`px-3 py-1.5 rounded-md ${team ? 'bg-[var(--surface)] shadow-sm font-semibold' : 'text-[var(--foreground-muted)]'}`}>Team</Link>
          <Link role="tab" aria-selected={!team} href={`/${orgSlug}/today?view=mine`} className={`px-3 py-1.5 rounded-md ${!team ? 'bg-[var(--surface)] shadow-sm font-semibold' : 'text-[var(--foreground-muted)]'}`}>Mine</Link>
        </div>
      ) : undefined}
    >
      <div className="max-w-3xl space-y-5">
        {sections.map((s) => (
          <section key={s.key} aria-labelledby={`today-${s.key}`} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-4 pt-4 pb-1">
            <div className="flex items-center gap-2.5 pb-1">
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${s.tone}`}><s.icon className="w-4 h-4" aria-hidden="true" /></span>
              <div className="flex-1">
                <h2 id={`today-${s.key}`} className="text-[14px] font-semibold">{s.title} <span className="text-[var(--foreground-muted)] font-normal">· {s.leads.length}</span></h2>
                <p className="text-[12px] text-[var(--foreground-muted)]">{s.hint}</p>
              </div>
            </div>
            {s.leads.length === 0
              ? <p className="py-4 text-[13px] text-[var(--foreground-subtle)]">All clear.</p>
              : <TodayList kind={s.key} leads={s.leads} orgSlug={orgSlug} showAssignee={team} />}
          </section>
        ))}
      </div>
    </PageShell>
  )
}
