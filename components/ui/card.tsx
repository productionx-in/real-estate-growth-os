// components/ui/card.tsx
import * as React from 'react'
import { cn } from '@/lib/utils/cn'
import { Tilt } from './tilt'

/**
 * A raised surface (lit top edge over a soft shadow). `interactive` — the whole card opens something — lifts toward the
 * pointer and presses on tap; use it only when the card really is clickable.
 */
export function Card({ className, interactive = false, ...props }: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return <div className={cn('surface-raised rounded-xl border border-default bg-surface', interactive && 'lift cursor-pointer', className)} {...props} />
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-start justify-between gap-3 px-4 pt-4', className)} {...props} />
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('text-[13px] font-semibold text-foreground', className)} {...props} />
}
export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('mt-0.5 text-[12px] text-muted', className)} {...props} />
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...props} />
}
export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center justify-end gap-2 border-t border-default px-4 py-3', className)} {...props} />
}

/** A single number with its label — the dashboard tile. */
export function StatCard({ label, value, hint, tone = 'neutral' }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: 'neutral' | 'good' | 'bad' }) {
  const color = tone === 'good' ? 'text-success' : tone === 'bad' ? 'text-danger' : 'text-foreground'
  return (
    <Tilt className="surface-raised rounded-xl border border-default bg-surface p-4">
      <p className="text-[12px] text-muted">{label}</p>
      <p className={cn('mt-1 text-[24px] font-bold tabular-nums [transform:translateZ(18px)]', color)}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-subtle">{hint}</p>}
    </Tilt>
  )
}
