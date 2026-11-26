'use client'
// components/marketing/LeadFlowPreview.tsx — the hero's "Lead Timeline": a frosted card floating over an offset
// metric card, with a gentle pointer parallax (max 3.5°, spring easing; off with prefers-reduced-motion).
// The timeline reads like a precision scrubber: a timestamp axis with colour-coded event pills.
// Pure markup (no screenshots), so it stays sharp at any size. Names are fictional.
import { useRef } from 'react'
import { CheckCircle2, Timer } from 'lucide-react'

const EVENTS = [
  { at: 0, t: '10:42:03', label: 'Captured', detail: 'Meta lead form · Rohan Iyer · 3 BHK', tone: 'bg-brand-light text-brand border-brand/20', dot: 'bg-brand' },
  { at: 6, t: '10:42:04', label: 'Routed', detail: 'To Asha (Towers Desk) · her turn in the rotation', tone: 'bg-brand-light text-brand border-brand/20', dot: 'bg-brand' },
  { at: 14, t: '10:42:05', label: 'Instant alert', detail: 'Buyer’s number one tap away', tone: 'bg-warning-bg text-warning border-warning/20', dot: 'bg-warning' },
  { at: 100, t: '10:44:31', label: 'Site visit booked', detail: 'First call made · Saturday 11:00', tone: 'bg-success-bg text-success border-success/20', dot: 'bg-success' },
]

export function LeadFlowPreview() {
  const ref = useRef<HTMLDivElement>(null)
  const move = (e: React.PointerEvent) => {
    const el = ref.current
    if (!el || e.pointerType !== 'mouse' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    el.style.setProperty('--ry', `${(x * 7).toFixed(2)}deg`)
    el.style.setProperty('--rx', `${(-y * 7).toFixed(2)}deg`)
  }
  const leave = () => { ref.current?.style.setProperty('--rx', '0deg'); ref.current?.style.setProperty('--ry', '0deg') }

  return (
    <div className="relative px-2 pt-24 sm:px-6" onPointerMove={move} onPointerLeave={leave}>
      <div ref={ref} className="tilt relative">
        {/* Secondary metric card, offset behind */}
        <div aria-hidden="true" className="ceramic absolute -right-1 -top-20 w-[58%] p-4 pb-12 sm:-right-5">
          <div className="flex items-center justify-between text-[11px] font-medium text-muted">
            <span>Response SLA · this week</span><span className="text-success">Optimal</span>
          </div>
          <div className="mt-2 flex items-end gap-2">
            <span className="text-[22px] font-bold leading-none tracking-tight text-foreground">94%</span>
            <span className="pb-0.5 text-[11px] text-muted">within 5 min</span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full" style={{ background: 'linear-gradient(90deg, var(--chart-2), var(--chart-3) 70%, var(--chart-5))' }}>
            <div className="ml-[94%] h-full w-1 rounded-full bg-surface" />
          </div>
        </div>

        {/* Foreground: the lead timeline */}
        <figure className="ceramic relative p-5 [box-shadow:0_0_0_1px_rgb(15_23_42/0.05),0_4px_10px_rgb(11_17_32/0.04),0_30px_60px_-18px_rgb(11_17_32/0.22)]">
          <figcaption className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-foreground">Lead timeline</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-success/20 bg-success-bg px-2.5 py-0.5 text-[12px] font-medium text-success">
              <CheckCircle2 className="size-3.5" aria-hidden="true" /> Contacted in 2 min 28 s
            </span>
          </figcaption>

          {/* Scrubber: axis, ticks and event markers */}
          <div aria-hidden="true" className="relative mt-5 h-8">
            <div className="absolute inset-x-0 top-3 h-1 rounded-full" style={{ background: 'linear-gradient(90deg, var(--brand), var(--chart-4))' }} />
            {EVENTS.map((e) => (
              <span key={e.t} className={`absolute top-1.5 size-4 -translate-x-1/2 rounded-full border-2 border-surface shadow-sm ${e.dot}`} style={{ left: `${Math.max(2, Math.min(98, e.at))}%` }} />
            ))}
            <div className="absolute inset-x-0 top-6 flex justify-between font-mono text-[10px] text-subtle"><span>10:42:03</span><span>+1 min</span><span>10:44:31</span></div>
          </div>

          <ol className="mt-4 space-y-2.5">
            {EVENTS.map((e) => (
              <li key={e.t} className="flex items-start gap-3">
                <span className={`mt-0.5 inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${e.tone}`}>{e.label}</span>
                <span className="min-w-0">
                  <span className="block text-[13px] leading-snug text-foreground">{e.detail}</span>
                  <span className="block font-mono text-[11px] text-subtle">{e.t}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-4 inline-flex items-center gap-1.5 text-[11px] text-subtle"><Timer className="size-3.5" aria-hidden="true" /> Illustration. Names are fictional.</p>
        </figure>
      </div>
    </div>
  )
}
