// components/dashboard/ActionBoard.tsx
// Home dashboard: what needs doing now, each number opening the exact leads behind it.
import Link from 'next/link'
import { AlarmClock, CalendarCheck, CircleSlash, Clock, MapPinned, UserX } from 'lucide-react'
import type { ActionBoard as Board, Focus, Period } from '@/lib/dal/action-board'
import { PERIODS } from '@/lib/dal/action-board'
import { TodayList } from '@/components/today/TodayList'
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@/components/ui'
import { cn } from '@/lib/utils/cn'

const TILES: { focus: Focus; label: string; hint: string; icon: typeof Clock; tone: 'danger' | 'warning' | 'neutral' }[] = [
  { focus: 'waiting', label: 'Waiting for a first call', hint: 'never called or messaged yet', icon: Clock, tone: 'danger' },
  { focus: 'unassigned', label: 'Nobody assigned', hint: 'open leads without an owner', icon: UserX, tone: 'danger' },
  { focus: 'overdue', label: 'Follow-up overdue', hint: 'next step time has passed', icon: AlarmClock, tone: 'warning' },
  { focus: 'no_next_step', label: 'No next step', hint: 'in progress, nothing scheduled', icon: CircleSlash, tone: 'warning' },
  { focus: 'visited', label: 'Visited, not booked', hint: 'ready for a closing call', icon: MapPinned, tone: 'neutral' },
]

function Tile({ href, label, hint, value, icon: Icon, tone }: { href: string; label: string; hint: string; value: number; icon: typeof Clock; tone: 'danger' | 'warning' | 'neutral' }) {
  const hot = value > 0 && tone !== 'neutral'
  return (
    <Link href={href} className={cn(
      'group rounded-xl border bg-surface p-4 shadow-sm transition-colors hover:bg-surface-hover focus-visible:outline-2',
      hot ? (tone === 'danger' ? 'border-danger/40' : 'border-warning/40') : 'border-default'
    )}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-medium text-muted">{label}</p>
        <Icon aria-hidden className={cn('size-4', hot ? (tone === 'danger' ? 'text-danger' : 'text-warning') : 'text-subtle')} />
      </div>
      <p className={cn('mt-1 text-[26px] font-bold tabular-nums', hot ? (tone === 'danger' ? 'text-danger' : 'text-warning') : 'text-foreground')}>{value}</p>
      <p className="text-[11px] text-subtle">{hint} <span className="text-brand opacity-0 transition-opacity group-hover:opacity-100">Open →</span></p>
    </Link>
  )
}

export function ActionBoard({ board, orgSlug, showTeam, mine, keep = '' }: { board: Board; orgSlug: string; showTeam: boolean; mine: boolean; /** Extra query kept on the period tabs, e.g. "&as=<id>". */ keep?: string }) {
  const leadsHref = (focus: Focus) => `/${orgSlug}/leads?focus=${focus}`
  const max = Math.max(1, board.funnel[0]?.reached ?? 0)

  return (
    <div className="space-y-5">
      <nav aria-label="Period" className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-muted">
          {mine ? 'Your leads' : 'Whole team'} · response target {board.responseMinutes} min
          {!mine && <> · <Link href={`/${orgSlug}/routing`} className="text-brand hover:underline">change</Link></>}
        </p>
        <div className="inline-flex rounded-lg border border-default bg-background p-0.5 text-[12px]">
          {(Object.keys(PERIODS) as Period[]).map((p) => (
            <Link key={p} href={`/${orgSlug}?period=${p}${keep}`} aria-current={p === board.period ? 'page' : undefined}
              className={cn('rounded-md px-3 py-1.5', p === board.period ? 'bg-surface font-semibold shadow-sm' : 'text-muted hover:text-foreground')}>
              {PERIODS[p]}
            </Link>
          ))}
        </div>
      </nav>

      <section aria-label="Needs action" className={cn('grid grid-cols-2 gap-3 md:grid-cols-3', mine ? 'xl:grid-cols-4' : 'xl:grid-cols-5')}>
        {TILES.filter((t) => !(mine && t.focus === 'unassigned')).map((t) => <Tile key={t.focus} href={leadsHref(t.focus)} {...t} value={board.counts[t.focus]} />)}
      </section>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <div>
              <CardTitle>Call these first</CardTitle>
              <CardDescription>Oldest waiting first. Calling in the first few minutes gives the best chance of reaching the buyer.</CardDescription>
            </div>
            {board.counts.waiting > board.waitingLeads.length && (
              <Link href={leadsHref('waiting')} className="shrink-0 text-[12px] font-medium text-brand hover:underline">All {board.counts.waiting} →</Link>
            )}
          </CardHeader>
          <CardContent className="pt-1">
            {board.waitingLeads.length === 0
              ? <EmptyState icon={CalendarCheck} title="Nobody is waiting" description="Every lead past the response target has had a first call or WhatsApp." />
              : <TodayList kind="waiting" leads={board.waitingLeads} orgSlug={orgSlug} showAssignee={!mine} />}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Enquiry to booking</CardTitle>
              <CardDescription>{board.counts.newLeads} new leads · {PERIODS[board.period].toLowerCase()} · {board.counts.visitsToday} site visits today</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 pt-1">
            {board.funnel.map((s, i) => {
              const prev = i === 0 ? null : board.funnel[i - 1].reached
              const conv = prev ? Math.round((s.reached / prev) * 100) : null
              return (
                <Link key={s.status} href={`/${orgSlug}/leads?status=${s.status}`} className="block rounded-md px-1 py-0.5 hover:bg-surface-hover">
                  <div className="flex items-baseline justify-between text-[12px]">
                    <span className="text-foreground">{s.label}</span>
                    <span className="tabular-nums text-muted">{s.reached}{conv !== null && <span className="ml-2 text-subtle">{conv}%</span>}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-surface-hover" aria-hidden>
                    <div className="h-2 rounded-full bg-brand" style={{ width: `${(s.reached / max) * 100}%` }} />
                  </div>
                </Link>
              )
            })}
            <p className="pt-1 text-[11px] text-subtle">
              Also in this period: <Link href={`/${orgSlug}/leads?status=lost`} className="hover:underline">{board.closedLost} lost</Link> ·{' '}
              <Link href={`/${orgSlug}/leads?status=junk`} className="hover:underline">{board.closedJunk} junk</Link>
            </p>
          </CardContent>
        </Card>
      </div>

      {showTeam && board.team && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Team right now</CardTitle>
              <CardDescription>Who has leads waiting or overdue. Bookings are for {PERIODS[board.period].toLowerCase()}.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto p-0">
            {board.team.length === 0 ? <p className="px-4 pb-4 text-[13px] text-muted">No active salespeople yet.</p> : (
              <table className="w-full min-w-[640px] text-[13px]">
                <thead>
                  <tr className="border-b border-default text-left text-muted">
                    <th scope="col" className="px-4 py-2 font-medium">Person</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Open leads</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Waiting</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Overdue</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">No next step</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Visits today</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Bookings</th>
                  </tr>
                </thead>
                <tbody>
                  {board.team.map((r) => (
                    <tr key={r.profileId} className="border-b border-default last:border-0">
                      <td className="px-4 py-2"><span className="font-medium">{r.name}</span> <span className="text-[11px] text-subtle">{r.role.replace('_', ' ')}</span></td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.open}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.waiting > 0 ? <Badge tone="danger">{r.waiting}</Badge> : 0}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.overdue > 0 ? <Badge tone="warning">{r.overdue}</Badge> : 0}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.noNextStep}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.visitsToday}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{r.bookings}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
