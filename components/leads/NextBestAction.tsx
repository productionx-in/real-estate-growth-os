// components/leads/NextBestAction.tsx — the one suggested next step on a lead (lib/leads/next-action.ts), with a link
// to the part of the page where it is done. Suggestions only; nothing happens until someone acts.
import { ArrowRight, Lightbulb } from 'lucide-react'
import type { NextAction } from '@/lib/leads/next-action'
import { cn } from '@/lib/utils/cn'

const TARGET: Record<Exclude<NextAction['target'], null>, { href: string; label: string }> = {
  work: { href: '#lead-work', label: 'Log a call or follow-up' },
  visit: { href: '#lead-actions', label: 'Schedule visit (top of page)' },
  matches: { href: '#lead-matches', label: 'See matching units' },
  documents: { href: '#lead-documents', label: 'Share a document' },
  stage: { href: '#lead-stage', label: 'Change the stage' },
}

export function NextBestAction({ action }: { action: NextAction }) {
  const t = action.target ? TARGET[action.target] : null
  return (
    <section aria-labelledby="next-action" className={cn('rounded-lg border p-4',
      action.tone === 'danger' ? 'border-danger bg-danger-bg' : action.tone === 'warning' ? 'border-warning bg-warning-bg' : 'border-default bg-brand-light')}>
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted"><Lightbulb aria-hidden className="size-3.5" /> Next best action</p>
      <h2 id="next-action" className="mt-1 text-[15px] font-semibold text-foreground">{action.title}</h2>
      {action.detail && <p className="mt-0.5 text-[13px] text-foreground">{action.detail}</p>}
      {action.secondary && <p className="mt-1 text-[12px] text-muted">{action.secondary}</p>}
      {t && <a href={t.href} className="mt-2 inline-flex min-h-9 items-center gap-1 text-[13px] font-medium text-brand hover:underline">{t.label} <ArrowRight aria-hidden className="size-3.5" /></a>}
    </section>
  )
}
