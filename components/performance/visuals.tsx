'use client'
// components/performance/visuals.tsx — the visual vocabulary of sales performance, on design system v2: an animated
// level ring, progress bars that fill on arrival, 3D medal badges (tilt toward the pointer; locked ones are dimmed and
// show how close they are) and counters that count up. Everything respects reduced motion.
import { useEffect, useRef, useState } from 'react'
import { Calendar, Crown, Flame, Gem, MapPin, Phone, Rocket, Star, Target, Trophy, Lock } from 'lucide-react'
import { Tilt } from '@/components/ui/tilt'
import { cn } from '@/lib/utils/cn'

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Counts up from 0 to `value` once, on arrival. */
export function CountUp({ value, format = (n: number) => Math.round(n).toLocaleString('en-IN'), className }: { value: number; format?: (n: number) => string; className?: string }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    if (reduced() || value === 0) { const t = setTimeout(() => setShown(value), 0); return () => clearTimeout(t) }
    let raf = 0
    const start = performance.now(), dur = 900
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / dur)
      setShown(value * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <span className={cn('tabular-nums', className)}>{format(shown)}</span>
}

/** The level ring: how far along the way to the next level. */
export function LevelRing({ progress, level, index, size = 132 }: { progress: number; level: string; index: number; size?: number }) {
  const r = size / 2 - 10, c = 2 * Math.PI * r
  const [p, setP] = useState(0)
  useEffect(() => { const t = setTimeout(() => setP(progress), 60); return () => clearTimeout(t) }, [progress])
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={10} className="stroke-[var(--surface-hover)]" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={10} strokeLinecap="round" className="stroke-[var(--brand)]"
          strokeDasharray={c} strokeDashoffset={c * (1 - p)} style={{ transition: 'stroke-dashoffset 1.1s var(--ease-out)' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center [transform:translateZ(20px)]">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Level {index + 1}</span>
        <span className="mt-0.5 max-w-[80%] text-[14px] font-bold leading-tight text-foreground">{level}</span>
      </div>
    </div>
  )
}

/** A progress bar that fills on arrival; complete turns success. */
export function Bar({ value, max, label, sub, complete }: { value: number; max: number; label: React.ReactNode; sub?: React.ReactNode; complete?: boolean }) {
  const pct = max > 0 ? Math.min(1, value / max) : 0
  const [w, setW] = useState(0)
  useEffect(() => { const t = setTimeout(() => setW(pct), 80); return () => clearTimeout(t) }, [pct])
  const done = complete ?? pct >= 1
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="min-w-0 truncate font-medium text-foreground">{label}</span>
        <span className={cn('shrink-0 tabular-nums', done ? 'font-semibold text-success' : 'text-muted')}>{sub}</span>
      </div>
      <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-surface-hover" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)}>
        <div className={cn('h-full origin-left rounded-full', done ? 'bg-success' : 'bg-brand')}
          style={{ transform: `scaleX(${w})`, transition: 'transform 900ms var(--ease-out)' }} />
      </div>
    </div>
  )
}

const ICONS: Record<string, typeof Trophy> = { trophy: Trophy, phone: Phone, map: MapPin, calendar: Calendar, flame: Flame, target: Target, crown: Crown, gem: Gem, star: Star, rocket: Rocket }

/** An achievement medal: raised and lit when unlocked, dimmed with its progress when locked. */
export function Medal({ icon, title, description, unlocked, progress, xp, times, unlockedAt, size = 'md' }: {
  icon: string; title: string; description: string; unlocked: boolean; progress: number; xp: number; times?: number; unlockedAt?: string | null; size?: 'sm' | 'md'
}) {
  const Icon = ICONS[icon] ?? Trophy
  const when = unlockedAt ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(unlockedAt)) : null
  return (
    <Tilt className={cn('surface-raised h-full rounded-2xl border bg-surface p-4 text-center', unlocked ? 'border-warning/40' : 'border-default')}>
      <div className={cn('mx-auto flex items-center justify-center rounded-full [transform:translateZ(28px)]', size === 'sm' ? 'size-12' : 'size-16',
        unlocked ? 'medal-lit bg-warning text-warning-foreground' : 'bg-surface-hover text-subtle')}>
        {unlocked ? <Icon className={size === 'sm' ? 'size-6' : 'size-8'} aria-hidden /> : <Lock className="size-6" aria-hidden />}
      </div>
      <p className="mt-3 text-[14px] font-semibold text-foreground">{title}</p>
      <p className="mt-0.5 text-[12px] text-muted">{description}</p>
      {unlocked ? (
        <p className="mt-2 text-[11px] font-medium text-warning">{when ? `Unlocked ${when}` : 'Unlocked'}{times && times > 1 ? ` · ×${times}` : ''}{xp ? ` · +${xp} XP` : ''}</p>
      ) : (
        <div className="mx-auto mt-2 max-w-[140px]">
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover"><div className="h-full origin-left rounded-full bg-brand" style={{ transform: `scaleX(${progress})` }} /></div>
          <p className="mt-1 text-[11px] text-subtle">{Math.round(progress * 100)}%{xp ? ` · ${xp} XP` : ''}</p>
        </div>
      )}
    </Tilt>
  )
}

/** A small bar chart of points per day (last 30 days). */
export function XpHistory({ days }: { days: { date: string; xp: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.xp))
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div ref={ref} className="flex h-24 items-end gap-[3px]" role="img" aria-label={`Points per day, last ${days.length} days`}>
      {days.map((d, i) => (
        <div key={d.date} title={`${d.date}: ${d.xp} XP`} className="group relative flex-1">
          <div className={cn('stagger-bar w-full origin-bottom rounded-t-sm', d.xp > 0 ? 'bg-brand/80 group-hover:bg-brand' : 'bg-surface-hover')}
            style={{ height: `${Math.max(4, (d.xp / max) * 96)}px`, animationDelay: `${i * 15}ms` }} />
        </div>
      ))}
    </div>
  )
}
