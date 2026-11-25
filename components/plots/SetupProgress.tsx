// components/plots/SetupProgress.tsx — where the project's Interactive Plot Map set-up stands (lib/plots/setup.ts):
// the eight stages with who each one is with, progress from recorded steps only, the expected completion as an
// estimate in business hours (never a countdown), what is needed from the workspace, and when it last changed.
import { CheckCircle2, Circle, CircleDot, Clock, Hourglass } from 'lucide-react'
import { Badge } from '@/components/ui'
import type { SetupView } from '@/lib/plots/setup'
import { ResolveBlockerButton } from '@/components/plots/ResolveBlockerButton'
import { cn } from '@/lib/utils/cn'

const OWNER_LABEL = { regrow: 'REGrow team', customer: 'Your team', system: 'Automatic' } as const
const when = (iso: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(iso))
const day = (iso: string) => new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(iso))

export function SetupProgress({ view, orgId, canAct }: { view: SetupView; orgId: string; canAct: boolean }) {
  const pct = Math.round(view.progress * 100)
  const done = view.completed === view.stages.length
  const mine = view.openBlockers.filter((b) => b.waitingOn === 'customer')
  return (
    <section aria-labelledby="setup-title" className="surface-raised rounded-2xl border border-default bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="setup-title" className="text-[15px] font-semibold text-foreground">Map set-up</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {done ? 'Your plot map is set up and published.'
              : view.current ? <>Now: <span className="font-medium text-foreground">{view.current.label}</span> · with {OWNER_LABEL[view.current.owner]}</> : null}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[13px] font-medium tabular-nums text-foreground">{view.completed} of {view.stages.length} steps</p>
          {view.overdue && <Badge tone="warning" className="mt-1">Taking longer than planned</Badge>}
        </div>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-hover" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Set-up progress">
        <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>

      {!done && (
        <dl className="mt-3 grid gap-2 text-[13px] sm:grid-cols-2">
          {view.estimate && (
            <div className="flex items-start gap-2">
              <Clock aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
              <div>
                <dt className="text-muted">Expected ready</dt>
                <dd className="font-medium text-foreground">around {day(view.estimate)}</dd>
                <dd className="text-[12px] text-subtle">An estimate in working hours (Mon–Sat, 10:00–19:00 IST). Steps with your team assume one working day each.</dd>
              </div>
            </div>
          )}
          {view.waitingOnCustomer && (
            <div className="flex items-start gap-2">
              <Hourglass aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
              <div>
                <dt className="text-muted">Paused</dt>
                <dd className="text-foreground">Waiting for your team since {when(view.waitingOnCustomer.raisedAt)}. The REGrow clock restarts when it is done.</dd>
              </div>
            </div>
          )}
        </dl>
      )}

      {mine.length > 0 && (
        <div className="mt-3 space-y-2" aria-label="Needed from your team">
          {mine.map((b, i) => (
            <div key={b.id ?? i} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-warning bg-warning-bg p-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-foreground">Needed from you</p>
                <p className="text-[13px] text-foreground">{b.reason}</p>
                <p className="text-[12px] text-muted">Asked {when(b.raisedAt)}</p>
              </div>
              {canAct && b.id && <ResolveBlockerButton orgId={orgId} blockerId={b.id} />}
            </div>
          ))}
        </div>
      )}

      <ol className="mt-4 grid gap-1.5 sm:grid-flow-col sm:grid-cols-2 sm:grid-rows-4">
        {view.stages.map((s) => (
          <li key={s.key} className={cn('flex items-start gap-2 rounded-lg px-2 py-1.5 text-[13px]', s.state === 'current' && 'bg-brand-light')}>
            {s.state === 'done' ? <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
              : s.state === 'current' ? <CircleDot aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
              : <Circle aria-hidden className="mt-0.5 size-4 shrink-0 text-subtle" />}
            <div className="min-w-0">
              <p className={cn('text-foreground', s.state === 'current' && 'font-medium')}>
                {s.label}<span className="sr-only"> — {s.state === 'done' ? 'done' : s.state === 'current' ? 'in progress' : 'not started'}</span>
              </p>
              <p className="text-[12px] text-muted">{s.completedAt ? `Done ${when(s.completedAt)}` : OWNER_LABEL[s.owner]}</p>
            </div>
          </li>
        ))}
      </ol>
      {view.lastUpdated && <p className="mt-3 text-[12px] text-subtle">Last updated {when(view.lastUpdated)}</p>}
    </section>
  )
}
