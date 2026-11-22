'use client'
// components/leads/MoreActions.tsx — "More" on a lead's page: the occasional actions (register with a partner, merge,
// mark lost, archive) out of the way of the everyday ones. The panel stays mounted while closed so a dialog opened from
// it keeps working; Escape or clicking elsewhere closes it.
import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui'
import { cn } from '@/lib/utils/cn'

export function MoreActions({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null
      // Clicks inside the panel or inside a dialog it opened (rendered in a portal) keep it open.
      if (ref.current?.contains(t) || t?.closest('[role="dialog"]')) return
      setOpen(false)
    }
    document.addEventListener('keydown', onKey); document.addEventListener('pointerdown', onDown)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown) }
  }, [open])
  return (
    <div ref={ref} className="relative">
      <Button variant="secondary" size="sm" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal aria-hidden /> More
      </Button>
      <div className={cn('absolute right-0 z-30 mt-1 flex w-60 flex-col items-stretch gap-1.5 rounded-lg border border-default bg-surface p-2 shadow-lg [&>*]:w-full', !open && 'hidden')}>
        {children}
      </div>
    </div>
  )
}
