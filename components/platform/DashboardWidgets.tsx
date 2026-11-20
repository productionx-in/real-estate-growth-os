// components/platform/DashboardWidgets.tsx — console dashboard pieces (server components, no chart library).
// Every number shown comes from the caller; nothing here invents data.
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { ArrowUpRight, ChevronRight } from 'lucide-react'
import { Card } from '@/components/ui'
import { cn } from '@/lib/utils/cn'

export function KpiCard({ label, value, hint, icon: Icon, href, tone = 'neutral' }: {
  label: string; value: React.ReactNode; hint?: React.ReactNode; icon: LucideIcon; href?: string; tone?: 'neutral' | 'good' | 'bad' | 'highlight'
}) {
  const chip = tone === 'good' ? 'bg-success-bg text-success' : tone === 'bad' ? 'bg-danger-bg text-danger' : tone === 'highlight' ? 'bg-highlight text-highlight-foreground' : 'bg-surface-hover text-foreground'
  const body = (
    <Card className={cn('flex h-full items-start justify-between gap-3 rounded-2xl p-5', href && 'transition-shadow duration-150 hover:shadow-md')}>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-muted">{label}</p>
        <p className={cn('mt-2 text-[28px] font-bold leading-none tabular-nums', tone === 'bad' ? 'text-danger' : 'text-foreground')}>{value}</p>
        {hint && <p className="mt-2 text-[12px] text-subtle">{hint}</p>}
      </div>
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', chip)}>
        {href ? <ArrowUpRight className="size-5" aria-hidden="true" /> : <Icon className="size-5" aria-hidden="true" />}
      </span>
    </Card>
  )
  return href ? <Link href={href} className="block rounded-2xl" aria-label={`${label}: ${typeof value === 'string' || typeof value === 'number' ? value : ''}`}>{body}</Link> : body
}

export function Panel({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn('flex flex-col rounded-2xl', className)}>
      <div className="flex items-center justify-between gap-3 px-5 pt-5">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {action}
      </div>
      <div className="flex-1 p-5 pt-4">{children}</div>
    </Card>
  )
}

// Smooth line through points (Catmull-Rom converted to cubic Béziers).
function smoothPath(pts: [number, number][]) {
  if (pts.length < 2) return ''
  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1].toFixed(1)}`
  }
  return d
}

/** Weekly area chart: `primary` filled, optional `secondary` dashed. Labels are week-ending dates. */
export function TrendChart({ primary, secondary, labels, primaryLabel, secondaryLabel }: {
  primary: number[]; secondary?: number[] | null; labels: string[]; primaryLabel: string; secondaryLabel?: string
}) {
  const W = 640, H = 220, PAD_L = 32, PAD_B = 28, PAD_T = 12
  const max = Math.max(4, ...primary, ...(secondary ?? []))
  const step = Math.ceil(max / 4)
  const top = step * 4
  const x = (i: number) => PAD_L + (i * (W - PAD_L - 8)) / Math.max(1, primary.length - 1)
  const y = (v: number) => PAD_T + (1 - v / top) * (H - PAD_T - PAD_B)
  const pts = primary.map((v, i) => [x(i), y(v)] as [number, number])
  const line = smoothPath(pts)
  const area = `${line} L${x(primary.length - 1)},${H - PAD_B} L${x(0)},${H - PAD_B} Z`
  const sec = secondary ? smoothPath(secondary.map((v, i) => [x(i), y(v)] as [number, number])) : ''
  const peak = primary.reduce((best, v, i) => (v > primary[best] ? i : best), primary.length - 1)
  const total = primary.reduce((a, b) => a + b, 0)
  return (
    <figure>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-[12px] text-muted">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-highlight" aria-hidden="true" />{primaryLabel}</span>
        {secondary && <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dashed border-strong" aria-hidden="true" />{secondaryLabel}</span>}
      </div>
      <div className="-mx-1 overflow-x-auto px-1"><svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[480px]" role="img"
        aria-label={`${primaryLabel}: ${total} in the last ${primary.length} weeks${secondary ? `; ${secondaryLabel}: ${secondary.reduce((a, b) => a + b, 0)}` : ''}`}>
        <defs>
          <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--console-highlight)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--console-highlight)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((k) => (
          <g key={k}>
            <line x1={PAD_L} x2={W - 8} y1={y(step * k)} y2={y(step * k)} stroke="var(--border)" strokeDasharray={k ? '3 4' : undefined} />
            <text x={PAD_L - 8} y={y(step * k) + 4} textAnchor="end" fontSize="12" fill="var(--foreground-subtle)">{step * k}</text>
          </g>
        ))}
        <path d={area} fill="url(#trendFill)" />
        {sec && <path d={sec} fill="none" stroke="var(--border-strong)" strokeWidth="2" strokeDasharray="5 5" />}
        <path d={line} fill="none" stroke="var(--console-highlight)" strokeWidth="2.5" />
        {primary.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={i === peak ? 5 : 3} fill="var(--surface)" stroke="var(--console-highlight)" strokeWidth="2">
            <title>{`Week ending ${labels[i]}: ${v} ${primaryLabel.toLowerCase()}${secondary ? `, ${secondary[i]} ${secondaryLabel?.toLowerCase()}` : ''}`}</title>
          </circle>
        ))}
        {primary[peak] > 0 && (
          <g transform={`translate(${Math.min(Math.max(x(peak), PAD_L + 40), W - 48)}, ${Math.max(y(primary[peak]) - 18, 14)})`}>
            <rect x="-40" y="-13" width="80" height="22" rx="6" fill="var(--console-rail)" />
            <text y="2" textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--console-rail-strong)">{`${primary[peak]} · ${labels[peak]}`}</text>
          </g>
        )}
        {labels.map((l, i) => (i % 2 === (labels.length - 1) % 2) && (
          <text key={i} x={x(i)} y={H - 8} textAnchor={i === labels.length - 1 ? "end" : "middle"} fontSize="12" fill="var(--foreground-subtle)">{l}</text>
        ))}
      </svg></div>
    </figure>
  )
}

export function AttentionList({ items }: { items: { label: string; detail: string; count: number; href: string; tone: 'bad' | 'warn' | 'ok' }[] }) {
  const shown = items.filter((i) => i.count > 0)
  if (shown.length === 0) return <p className="py-6 text-center text-[13px] text-muted">Nothing needs attention right now.</p>
  return (
    <ul className="divide-y divide-default">
      {shown.map((i) => (
        <li key={i.label}>
          <Link href={i.href} className="-mx-2 flex min-h-14 items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-surface-hover">
            <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl text-[14px] font-bold tabular-nums',
              i.tone === 'bad' ? 'bg-danger-bg text-danger' : i.tone === 'warn' ? 'bg-warning-bg text-warning' : 'bg-success-bg text-success')}>{i.count}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium">{i.label}</span>
              <span className="block truncate text-[12px] text-muted">{i.detail}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** Concentric progress rings, each with its number in the legend (never colour alone). */
export function Rings({ rings, centre, centreLabel }: { rings: { label: string; value: number; color: string }[]; centre: string; centreLabel: string }) {
  const total = Math.max(1, rings.reduce((a, r) => a + r.value, 0))
  const size = 180, stroke = 12, gap = 6
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row lg:flex-col xl:flex-row">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true" className="-rotate-90">
          {rings.map((r, i) => {
            const rad = size / 2 - stroke / 2 - i * (stroke + gap)
            const c = 2 * Math.PI * rad
            return (
              <g key={r.label}>
                <circle cx={size / 2} cy={size / 2} r={rad} fill="none" stroke="var(--surface-hover)" strokeWidth={stroke} />
                {r.value > 0 && <circle cx={size / 2} cy={size / 2} r={rad} fill="none" stroke={r.color} strokeWidth={stroke} strokeLinecap="round"
                  strokeDasharray={`${(r.value / total) * c} ${c}`} />}
              </g>
            )
          })}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div><p className="text-[22px] font-bold tabular-nums">{centre}</p><p className="text-[11px] text-muted">{centreLabel}</p></div>
        </div>
      </div>
      <ul className="w-full space-y-2 text-[13px]">
        {rings.map((r) => (
          <li key={r.label} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: r.color }} aria-hidden="true" />
            <span className="flex-1 text-muted">{r.label}</span>
            <span className="font-semibold tabular-nums">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
