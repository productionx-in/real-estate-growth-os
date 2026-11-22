// components/leads/LeadStageStepper.tsx — where the lead is in the pipeline, at a glance. Done stages are ticked, the
// current one highlighted; a lost or junk lead shows the stage it reached and why it closed. Read-only: stages change
// in the Stage panel (the status API enforces the order).
import { Check, XCircle } from 'lucide-react'
import type { LeadStatus } from '@/types/database'
import { STATUS_LABELS } from '@/lib/leads/transitions'
import { PIPELINE } from '@/lib/leads/next-action'
import { cn } from '@/lib/utils/cn'

export function LeadStageStepper({ status, reachedStatus, closedReason }: { status: LeadStatus; reachedStatus?: LeadStatus | null; closedReason?: string | null }) {
  const closed = status === 'lost' || status === 'junk'
  const at = closed ? (reachedStatus ? PIPELINE.indexOf(reachedStatus) : -1) : PIPELINE.indexOf(status)
  return (
    <nav aria-label="Lead stage" className="relative overflow-x-auto rounded-lg border border-default bg-surface px-3 py-2.5">
      <ol className="flex min-w-max items-center gap-1">
        {PIPELINE.map((s, i) => {
          const done = i < at || (i === at && (closed || status === 'booked'))
          const current = !closed && i === at && status !== 'booked'
          return (
            <li key={s} className="flex items-center gap-1" aria-current={current ? 'step' : undefined}>
              {i > 0 && <span aria-hidden className={cn('h-px w-4 sm:w-6', i <= at && !closed ? 'bg-brand' : 'bg-[var(--border)]')} />}
              <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px]',
                current ? 'bg-brand text-brand-foreground font-medium' : done ? 'text-foreground' : 'text-subtle')}>
                {done && <Check aria-hidden className="size-3.5 text-success" />}
                {STATUS_LABELS[s]}
                <span className="sr-only">{current ? ' (current)' : done ? ' (done)' : ''}</span>
              </span>
            </li>
          )
        })}
        {closed && (
          <li className="ml-2 inline-flex items-center gap-1 rounded-full bg-danger-bg px-2 py-1 text-[12px] font-medium text-danger">
            <XCircle aria-hidden className="size-3.5" /> {STATUS_LABELS[status]}{closedReason ? ` · ${closedReason}` : ''}
          </li>
        )}
      </ol>
    </nav>
  )
}
