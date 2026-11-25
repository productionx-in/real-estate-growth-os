// Site visits: the week's visits by day, with booking and on-the-day actions.
// Sales executives see their own visits; managers and above see the team, or just theirs.
import { assignableRolesFor } from '@/lib/dal/sales-structure'
import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Users, Video } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { listVisits, OUTCOMES } from '@/lib/dal/site-visits'
import { getWorkspaceSettings } from '@/lib/dal/workspace-settings'
import { getResponseMinutes } from '@/lib/dal/action-board'
import { tzOffsetMinutes } from '@/lib/dal/follow-ups'
import { createServiceClient } from '@/lib/supabase/server'
import { Badge, Card, EmptyState, buttonVariants } from '@/components/ui'
import { ScheduleVisitDialog, type Option } from '@/components/visits/ScheduleVisitDialog'
import { VisitActions } from '@/components/visits/VisitActions'
import { cn } from '@/lib/utils/cn'
import { ASSIGNABLE_ROLES, canAssignTo, leadScopeOf } from '@/lib/auth/permissions'
import { resolveLeadViewer } from '@/lib/dal/viewer'

export const metadata: Metadata = { title: 'Site visits' }
export const dynamic = 'force-dynamic'

const STATUS: Record<string, { label: string; tone: 'brand' | 'info' | 'success' | 'warning' | 'danger' | 'neutral' }> = {
  scheduled: { label: 'Booked', tone: 'brand' }, rescheduled: { label: 'Moved', tone: 'brand' }, checked_in: { label: 'At site', tone: 'info' },
  completed: { label: 'Done', tone: 'success' }, no_show: { label: 'Didn’t come', tone: 'danger' }, cancelled: { label: 'Cancelled', tone: 'neutral' },
}

function localDay(d: Date, tz: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

export default async function VisitsPage({ params, searchParams }: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ from?: string; scope?: string; project?: string }>
}) {
  const { orgSlug } = await params
  const sp = await searchParams
  const { org, role, profile, isManager } = await getVerifiedWorkspace(orgSlug)
  const { timezone } = await getResponseMinutes(org.id)
  const canAct = role !== 'readonly'
  const scope = leadScopeOf(role)
  const viewer = await resolveLeadViewer(org.id, role, profile.id)
  // A sales executive or post-sales sees their own visits; a team lead their team's (or just theirs).
  const mine = scope === 'own' || scope === 'booked' || sp.scope === 'mine'
  const teamIds = scope === 'team' && !mine ? [profile.id, ...(viewer.teamProfileIds ?? [])] : null

  // The week shown: from the given day (or today), seven days, in the organisation's time zone.
  const todayLocal = localDay(new Date(), timezone)
  const fromLocal = sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : todayLocal
  const offset = tzOffsetMinutes(timezone, new Date())
  const from = new Date(Date.parse(`${fromLocal}T00:00:00.000Z`) - offset * 60_000)
  const to = new Date(from.getTime() + 7 * 86_400_000)
  const shift = (days: number) => localDay(new Date(from.getTime() + days * 86_400_000 + 12 * 3600_000), timezone)

  const db = createServiceClient()
  const checkinRadius = (await getWorkspaceSettings(org.id)).visits.checkinRadiusM
  const [visits, projects, members, leads] = await Promise.all([
    listVisits(org.id, { from, to, profileId: mine ? profile.id : null, profileIds: teamIds, projectId: sp.project || null }),
    db.from('projects').select('id, name').eq('org_id', org.id).order('name'),
    db.from('org_members').select('profile_id, profile:profiles!org_members_profile_id_fkey(full_name)').eq('org_id', org.id).eq('status', 'active').in('role', await assignableRolesFor(org.id)),
    (() => {
      let q = db.from('leads').select('id, name, phone').eq('org_id', org.id).not('status', 'in', '(booked,lost,junk)').order('updated_at', { ascending: false }).limit(300)
      if (scope === 'own') q = q.eq('assigned_to', profile.id)
      else if (scope === 'team') q = q.in('assigned_to', [profile.id, ...(viewer.teamProfileIds ?? [])])
      else if (scope === 'booked') q = q.eq('assigned_to', profile.id)
      return q
    })(),
  ])

  const projectOptions: Option[] = (projects.data ?? []).map((p) => ({ id: p.id, label: p.name }))
  type M = { profile_id: string; profile: { full_name: string } | { full_name: string }[] | null }
  const agentOptions: Option[] = ((members.data ?? []) as M[])
    .filter((m) => scope !== 'team' || canAssignTo(viewer, m.profile_id)).map((m) => ({
    id: m.profile_id, label: (Array.isArray(m.profile) ? m.profile[0]?.full_name : m.profile?.full_name) ?? 'Unknown',
  }))
  const leadOptions: Option[] = (leads.data ?? []).map((l) => ({ id: l.id, label: l.name, hint: l.phone }))

  const days = Array.from({ length: 7 }, (_, i) => {
    const key = shift(i)
    return { key, visits: visits.filter((v) => localDay(new Date(v.scheduled_at), timezone) === key) }
  })
  const dayLabel = (key: string) => new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${key}T12:00:00Z`))
  const time = (iso: string) => new Intl.DateTimeFormat('en-IN', { timeStyle: 'short', timeZone: timezone }).format(new Date(iso))
  const qs = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries({ from: fromLocal, scope: sp.scope, project: sp.project, ...o })) if (v) p.set(k, v)
    return `/${orgSlug}/visits?${p}`
  }
  const live = visits.filter((v) => ['scheduled', 'rescheduled', 'checked_in'].includes(v.status)).length

  return (
    <PageShell
      title="Site visits"
      description={`${live} upcoming this week · ${mine ? 'your visits' : 'whole team'}`}
      actions={canAct && (
        <ScheduleVisitDialog leads={leadOptions} projects={projectOptions} agents={agentOptions}
          defaultAgentId={profile.id} canPickAgent={isManager || scope === 'team'} />
      )}
    >
      <div className="max-w-5xl space-y-4">
        <nav aria-label="Week" className="flex flex-wrap items-center gap-2">
          <Link href={qs({ from: shift(-7) })} className={buttonVariants({ variant: 'secondary', size: 'icon' })} aria-label="Previous week"><ChevronLeft aria-hidden /></Link>
          <Link href={qs({ from: todayLocal })} className={buttonVariants({ variant: 'secondary', size: 'sm' })}>Today</Link>
          <Link href={qs({ from: shift(7) })} className={buttonVariants({ variant: 'secondary', size: 'icon' })} aria-label="Next week"><ChevronRight aria-hidden /></Link>
          <span className="text-[13px] font-medium">{dayLabel(days[0].key)} – {dayLabel(days[6].key)}</span>
          <span className="ml-auto flex flex-wrap gap-1.5 text-[12px]">
            {(isManager || scope === 'team') && (['team', 'mine'] as const).map((s) => (
              <Link key={s} href={qs({ scope: s === 'team' ? undefined : 'mine' })} aria-current={(s === 'mine') === mine ? 'page' : undefined}
                className={cn('rounded-full border px-3 py-1', (s === 'mine') === mine ? 'border-brand bg-brand text-brand-foreground' : 'border-default text-muted hover:bg-surface-hover')}>
                {s === 'team' ? 'Whole team' : 'Mine'}
              </Link>
            ))}
            {projectOptions.length > 1 && projectOptions.map((p) => (
              <Link key={p.id} href={qs({ project: sp.project === p.id ? undefined : p.id })} aria-current={sp.project === p.id ? 'page' : undefined}
                className={cn('rounded-full border px-3 py-1', sp.project === p.id ? 'border-brand bg-brand-light text-brand' : 'border-default text-muted hover:bg-surface-hover')}>
                {p.label}
              </Link>
            ))}
          </span>
        </nav>

        {visits.length === 0 ? (
          <Card><EmptyState icon={CalendarDays} title="No visits this week" description="Book a visit from here or from a lead's page. The buyer gets a confirmation and reminders automatically." /></Card>
        ) : days.map((d) => (
          <section key={d.key} aria-label={dayLabel(d.key)} className="space-y-2">
            <h2 className={cn('text-[12px] font-semibold uppercase tracking-wide', d.key === todayLocal ? 'text-brand' : 'text-subtle')}>
              {d.key === todayLocal ? 'Today · ' : ''}{dayLabel(d.key)} {d.visits.length > 0 && <span className="font-normal normal-case">· {d.visits.length}</span>}
            </h2>
            {d.visits.length === 0 ? <p className="pl-1 text-[12px] text-subtle">No visits</p> : d.visits.map((v) => {
              const s = STATUS[v.status] ?? { label: v.status, tone: 'neutral' as const }
              return (
                <Card key={v.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                  <div className="w-20 shrink-0 whitespace-nowrap text-[15px] font-semibold tabular-nums">{time(v.scheduled_at)}</div>
                  <div className="min-w-0 flex-1 space-y-0.5 text-[13px]">
                    <p className="flex flex-wrap items-center gap-2">
                      <Link href={`/${orgSlug}/leads/${v.lead_id}`} className="font-medium text-foreground hover:underline">{v.lead?.name ?? 'Lead'}</Link>
                      <Badge tone={s.tone}>{s.label}</Badge>
                      {v.outcome && <Badge>{OUTCOMES[v.outcome as keyof typeof OUTCOMES] ?? v.outcome}</Badge>}
                      {v.checkin_distance_m != null && v.checkin_distance_m > checkinRadius && (
                        <Badge tone="warning">Checked in {(v.checkin_distance_m / 1000).toFixed(1)} km away</Badge>
                      )}
                    </p>
                    <p className="flex flex-wrap gap-x-3 text-muted">
                      <span className="inline-flex items-center gap-1"><MapPin aria-hidden className="size-3.5" />{v.project?.name ?? 'Project'}</span>
                      {!mine && v.agent && <span>{v.agent.full_name}</span>}
                      <span className="inline-flex items-center gap-1"><Users aria-hidden className="size-3.5" />{v.visitor_count}{v.accompanied_by ? ` · with ${v.accompanied_by}` : ''}</span>
                      {v.meeting_link && <a href={v.meeting_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand hover:underline"><Video aria-hidden className="size-3.5" />Online</a>}
                    </p>
                    {v.notes && <p className="text-[12px] text-subtle">{v.notes}</p>}
                  </div>
                  {canAct && <VisitActions visitId={v.id} status={v.status} />}
                </Card>
              )
            })}
          </section>
        ))}
      </div>
    </PageShell>
  )
}
