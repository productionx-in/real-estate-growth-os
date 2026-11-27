// app/(dashboard)/[orgSlug]/calendar/page.tsx — the sales calendar: each salesperson's follow-ups and site visits by
// day, week, month or as an agenda, colour-coded by kind, overdue ones flagged. Owners, admins and managers open anyone's
// calendar or the whole team's (with each person's load); a team lead their team's; everyone else their own.
// Nothing is entered twice: it is the follow-ups and visits already on the leads (lib/calendar/rules.ts).
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { calendarItems, calendarPeople } from '@/lib/dal/calendar'
import { orgTimezone } from '@/lib/dal/performance'
import { teamProfileIdsOf } from '@/lib/dal/viewer'
import { canAssignLeads } from '@/lib/auth/permissions'
import { calendarScope, canOpenCalendarOf, localDay, parseDay, parseView, viewDays, workload } from '@/lib/calendar/rules'
import { PageShell } from '@/components/layout/PageShell'
import { CalendarSync } from '@/components/calendar/CalendarSync'
import { hasFeed } from '@/lib/dal/calendar-feed'
import { CalendarBoard } from '@/components/calendar/CalendarBoard'

export const metadata: Metadata = { title: 'Calendar' }
export const dynamic = 'force-dynamic'

export default async function CalendarPage({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ view?: string; date?: string; person?: string }> }) {
  const { orgSlug } = await params
  const sp = await searchParams
  const { org, role, profile } = await getVerifiedWorkspace(orgSlug)
  if (role === 'readonly') notFound()
  const tz = await orgTimezone(org.id)
  const now = new Date()
  const view = parseView(sp.view)
  const anchor = parseDay(sp.date, localDay(now, tz))
  const scope = calendarScope(role)
  const teamIds = scope === 'team' ? await teamProfileIdsOf(org.id, profile.id) : []

  // Whose calendar: "team" (managers: everyone; team leads: their team), a person, or your own.
  const wantTeam = sp.person === 'team' && scope !== 'own'
  let person = profile.id
  if (!wantTeam && sp.person && /^[0-9a-f-]{36}$/.test(sp.person)) {
    if (!canOpenCalendarOf(role, profile.id, teamIds, sp.person)) notFound()
    person = sp.person
  }
  const people = scope === 'own' ? [] : await calendarPeople(org.id, scope === 'team' ? teamIds : null)
  if (!wantTeam && person !== profile.id && !people.some((p) => p.id === person)) notFound()
  const who = wantTeam ? (scope === 'team' ? teamIds : null) : [person]

  const days = viewDays(view, anchor)
  const [{ items, overdue }, syncing] = await Promise.all([calendarItems(org.id, days, tz, who, now), hasFeed(org.id, profile.id)])
  return (
    <PageShell title="Calendar" description="Follow-ups and site visits from your leads, kept in step automatically. Drag a follow-up to another day to move it." actions={<CalendarSync orgId={org.id} active={syncing} />}>
      <CalendarBoard
        orgId={org.id} orgSlug={orgSlug} tz={tz} view={view} anchor={anchor} today={localDay(now, tz)} days={days}
        items={items} overdue={overdue} people={people} person={wantTeam ? 'team' : person} me={profile.id}
        canPickPeople={scope !== 'own'} canAssign={canAssignLeads(role)} assignOnly={scope === 'team' ? teamIds : null}
        load={wantTeam ? workload([...items, ...overdue], tz, now) : null} nowMs={now.getTime()}
      />
    </PageShell>
  )
}
