// components/ui/chart.tsx — the one chart design. ChartFrame is the card every chart sits in: title, description,
// legend and a "Show as table" switch with the same numbers (for screen readers, exports and exact values). BarList
// (ranked or funnel bars) and ColumnChart (values over time) draw with the chart colour tokens (--chart-1…5) so light
// and dark themes match, and animate in with the shared stagger, which respects reduced motion.
'use client'
import * as React from 'react'
import { cn } from '@/lib/utils/cn'
import { Table, TH, TD } from '@/components/ui/table'

export type ChartTone = 1 | 2 | 3 | 4 | 5
const FILL: Record<ChartTone, string> = { 1: 'var(--chart-1)', 2: 'var(--chart-2)', 3: 'var(--chart-3)', 4: 'var(--chart-4)', 5: 'var(--chart-5)' }
const fill = (t: ChartTone = 1) => FILL[t]

export interface ChartRow { label: string; value: number; hint?: string; tone?: ChartTone }

export function ChartFrame({ title, description, legend, action, rows, format = (n: number) => n.toLocaleString('en-IN'), valueLabel = 'Value', className, children }: {
  title: string; description?: string; legend?: { label: string; tone: ChartTone }[]; action?: React.ReactNode
  /** The numbers behind the chart, for the table view. */
  rows?: ChartRow[]; format?: (n: number) => string; valueLabel?: string; className?: string; children: React.ReactNode
}) {
  const [asTable, setAsTable] = React.useState(false)
  return (
    <figure className={cn('surface-raised flex flex-col rounded-2xl border border-default bg-surface p-5', className)}>
      <figcaption className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-foreground">{title}</h3>
          {description && <p className="mt-0.5 text-[12px] text-muted">{description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {action}
          {rows && rows.length > 0 && (
            <button type="button" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable} className="rounded-lg px-2 py-1 text-[12px] font-medium text-muted hover:bg-surface-hover hover:text-foreground">
              {asTable ? 'Show chart' : 'Show as table'}
            </button>
          )}
        </div>
      </figcaption>
      {legend && legend.length > 0 && !asTable && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
          {legend.map((l) => <li key={l.label} className="flex items-center gap-1.5"><span className="size-2.5 rounded-full" style={{ background: fill(l.tone) }} aria-hidden />{l.label}</li>)}
        </ul>
      )}
      <div className="mt-4 flex-1">
        {asTable && rows ? (
          <Table><thead><tr><TH>Item</TH><TH num>{valueLabel}</TH></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.label}><TD>{r.label}{r.hint ? <span className="block text-[11px] text-subtle">{r.hint}</span> : null}</TD><TD num>{format(r.value)}</TD></tr>)}</tbody>
          </Table>
        ) : children}
      </div>
    </figure>
  )
}

/** Horizontal bars, longest first or in the given order (a funnel). Values are written out, never colour alone. */
export function BarList({ rows, format = (n: number) => n.toLocaleString('en-IN'), max, empty = 'Nothing to show yet.' }: { rows: ChartRow[]; format?: (n: number) => string; max?: number; empty?: string }) {
  if (!rows.length) return <p className="py-6 text-center text-[13px] text-muted">{empty}</p>
  const top = Math.max(1, max ?? Math.max(...rows.map((r) => r.value)))
  return (
    <ul className="stagger space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate text-foreground">{r.label}{r.hint ? <span className="ml-1.5 text-[11px] text-subtle">{r.hint}</span> : null}</span>
            <span className="shrink-0 font-semibold tabular-nums text-foreground">{format(r.value)}</span>
          </div>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-surface-hover" aria-hidden>
            <div className="stagger-bar-x h-full origin-left rounded-full" style={{ width: `${r.value > 0 ? Math.max(2, (r.value / top) * 100) : 0}%`, background: fill(r.tone) }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Vertical columns over a period, with light gridlines and the value on hover/focus. */
export function ColumnChart({ rows, format = (n: number) => n.toLocaleString('en-IN'), height = 180, label }: { rows: ChartRow[]; format?: (n: number) => string; height?: number; label: string }) {
  const top = Math.max(1, ...rows.map((r) => r.value))
  const step = Math.ceil(top / 4) || 1
  const ceil = step * 4
  return (
    <div role="img" aria-label={`${label}: ${rows.map((r) => `${r.label} ${format(r.value)}`).join(', ')}`}>
      <div className="relative" style={{ height }}>
        {[0, 1, 2, 3, 4].map((k) => (
          <div key={k} className="absolute inset-x-0 flex items-center gap-2" style={{ bottom: `${(k / 4) * 100}%` }} aria-hidden>
            <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-subtle">{k === 0 ? 0 : format(step * k)}</span>
            <span className={cn('h-px flex-1', k ? 'border-t border-dashed border-default' : 'bg-[var(--border)]')} />
          </div>
        ))}
        <div className="stagger absolute inset-y-0 left-10 right-0 flex items-end gap-1.5">
          {rows.map((r) => (
            <div key={r.label} className="group relative flex h-full flex-1 items-end" tabIndex={0} aria-label={`${r.label}: ${format(r.value)}`}>
              <div className="stagger-bar w-full origin-bottom rounded-t-md transition-opacity group-hover:opacity-80" style={{ height: `${(r.value / ceil) * 100}%`, background: fill(r.tone) }} />
              <span className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-1.5 py-0.5 text-[11px] font-medium text-background opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100">{format(r.value)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="ml-10 mt-1.5 flex gap-1.5" aria-hidden>
        {rows.map((r, i) => <span key={r.label} className="flex-1 truncate text-center text-[10px] text-subtle">{rows.length > 8 && i % 2 ? '' : r.label}</span>)}
      </div>
    </div>
  )
}

/** A headline number tile (the KPI row above charts). */
export function StatTile({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: ChartTone }) {
  return (
    <div className="surface-raised rounded-2xl border border-default bg-surface p-5">
      <p className="text-[12px] font-medium text-muted">{label}</p>
      <p className="mt-1.5 text-[24px] font-bold tabular-nums text-foreground" style={tone ? { color: fill(tone) } : undefined}>{value}</p>
      {hint && <p className="mt-0.5 text-[12px] text-subtle">{hint}</p>}
    </div>
  )
}
