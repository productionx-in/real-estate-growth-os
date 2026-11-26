// components/platform/ConsoleUI.tsx — shared console building blocks, so every screen reads the same way:
// page header, filter tabs with counts, table card, health badge, funnel bars, queue list.
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui'
import { cn } from '@/lib/utils/cn'
import type { HealthBand } from '@/lib/platform/insights'

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-[13px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Pill tabs; the URL carries the filter. `count` is shown when given. */
export function FilterTabs({ label, tabs }: { label: string; tabs: { href: string; label: string; count?: number; active: boolean; tone?: 'danger' }[] }) {
  return (
    <nav aria-label={label} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.active ? 'page' : undefined}
          className={cn('inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition-colors duration-150',
            t.active ? 'border-transparent bg-foreground text-background' : 'border-default bg-surface text-muted hover:text-foreground')}>
          {t.label}
          {t.count !== undefined && (
            <span className={cn('rounded-full px-1.5 text-[11px] tabular-nums',
              t.active ? 'bg-highlight text-highlight-foreground' : t.tone === 'danger' && t.count ? 'bg-danger-bg text-danger' : 'bg-surface-hover text-muted')}>{t.count}</span>
          )}
        </Link>
      ))}
    </nav>
  )
}

export function TableCard({ children, minWidth = 720, className }: { children: React.ReactNode; minWidth?: number; className?: string }) {
  return (
    <Card className={cn('overflow-hidden rounded-2xl', className)}>
      <div className="overflow-x-auto">
        <table className="data-table w-full text-[13px]" style={{ minWidth }}>{children}</table>
      </div>
    </Card>
  )
}
export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th scope="col" className={cn('whitespace-nowrap bg-surface-muted px-4 py-3 text-left text-[12px] font-medium text-muted first:pl-5', className)}>{children}</th>
}
export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn('border-t border-default px-4 py-3 align-middle first:pl-5', className)}>{children}</td>
}

const BAND = { healthy: ['Healthy', 'bg-success-bg text-success'], watch: ['Watch', 'bg-warning-bg text-warning'], at_risk: ['At risk', 'bg-danger-bg text-danger'] } as const
export function HealthBadge({ band, score }: { band: HealthBand; score: number }) {
  const [label, cls] = BAND[band]
  return <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[12px] font-semibold', cls)}><span className="tabular-nums">{score}</span>{label}</span>
}

/** Horizontal bars for a funnel; every bar carries its number. */
export function FunnelBars({ rows }: { rows: { label: string; value: number; href?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => {
        const bar = (
          <>
            <span className="w-32 shrink-0 truncate text-[13px] text-muted">{r.label}</span>
            <span className="relative h-6 flex-1 overflow-hidden rounded-md bg-surface-hover">
              <span className="absolute inset-y-0 left-0 rounded-md bg-highlight" style={{ width: `${(r.value / max) * 100}%` }} aria-hidden="true" />
            </span>
            <span className="w-8 text-right text-[13px] font-semibold tabular-nums">{r.value}</span>
          </>
        )
        return <li key={r.label}>{r.href ? <Link href={r.href} className="flex items-center gap-3 rounded-md hover:opacity-80">{bar}</Link> : <div className="flex items-center gap-3">{bar}</div>}</li>
      })}
    </ul>
  )
}

/** Clickable list of work items: title, detail, a right-hand note. */
export function QueueList({ items, empty }: { items: { href: string; title: string; detail?: string; note?: string; noteTone?: 'danger' | 'warn' | 'muted' }[]; empty: string }) {
  if (!items.length) return <p className="py-6 text-center text-[13px] text-muted">{empty}</p>
  return (
    <ul className="-mx-2 divide-y divide-default">
      {items.map((i) => (
        <li key={i.href + i.title}>
          <Link href={i.href} className="flex min-h-12 items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-surface-hover">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">{i.title}</span>
              {i.detail && <span className="block truncate text-[12px] text-muted">{i.detail}</span>}
            </span>
            {i.note && <span className={cn('shrink-0 text-[12px] font-medium tabular-nums', i.noteTone === 'danger' ? 'text-danger' : i.noteTone === 'warn' ? 'text-warning' : 'text-muted')}>{i.note}</span>}
            <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** Compact tile for a role's focus row: big number, label, link. */
export function FocusTile({ label, value, href, icon: Icon, tone = 'neutral', hint }: { label: string; value: number | string; href: string; icon: LucideIcon; tone?: 'neutral' | 'bad' | 'warn' | 'good'; hint?: string }) {
  const chip = tone === 'bad' ? 'bg-danger-bg text-danger' : tone === 'warn' ? 'bg-warning-bg text-warning' : tone === 'good' ? 'bg-success-bg text-success' : 'bg-surface-hover text-foreground'
  return (
    <Link href={href} className="block rounded-2xl">
      <Card className="flex h-full flex-col items-start gap-3 rounded-2xl p-4 transition-shadow duration-150 hover:shadow-md sm:flex-row sm:items-center sm:gap-4">
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl sm:size-11', chip)}><Icon className="size-5" aria-hidden="true" /></span>
        <span className="min-w-0 w-full">
          <span className={cn('block text-[24px] font-bold leading-none tabular-nums', tone === 'bad' && Number(value) > 0 ? 'text-danger' : 'text-foreground')}>{value}</span>
          <span className="mt-1 block text-[13px] leading-snug text-muted sm:truncate">{label}</span>
          {hint && <span className="block truncate text-[11px] text-subtle">{hint}</span>}
        </span>
      </Card>
    </Link>
  )
}
