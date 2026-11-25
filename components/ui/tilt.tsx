'use client'
// components/ui/tilt.tsx — the 3D tilt for showcase surfaces (dashboard tiles, project and template cards): a few
// degrees of perspective toward the pointer and a soft light that follows it (.tilt3d in app/globals.css).
// Mouse and trackpad only — never on touch — and nothing with reduced motion. Updates once per frame at most.
import * as React from 'react'
import { cn } from '@/lib/utils/cn'

const MAX_DEG = 4

export function Tilt({ className, children, max = MAX_DEG, ...props }: React.HTMLAttributes<HTMLDivElement> & { max?: number }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const frame = React.useRef(0)

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return
    const el = ref.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const { clientX, clientY } = e
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect()
      const x = (clientX - r.left) / r.width, y = (clientY - r.top) / r.height
      el.style.setProperty('--ry', `${((x - 0.5) * 2 * max).toFixed(2)}deg`)
      el.style.setProperty('--rx', `${((0.5 - y) * 2 * max).toFixed(2)}deg`)
      el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`)
      el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`)
      el.dataset.active = ''
    })
  }
  const onLeave = () => {
    const el = ref.current
    if (!el) return
    cancelAnimationFrame(frame.current)
    el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg')
    delete el.dataset.active
  }
  React.useEffect(() => () => cancelAnimationFrame(frame.current), [])

  return <div ref={ref} onPointerMove={onMove} onPointerLeave={onLeave} className={cn('tilt3d relative', className)} {...props}>{children}</div>
}
