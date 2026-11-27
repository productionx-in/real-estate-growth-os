'use client'
// components/marketing/ProductTour.tsx — the website's click-through product tour: real RE screens with fictional
// sample data (captured from the demo seed), one step per screen, with numbered hotspots that explain what to look at.
// Keyboard: ← / → move between steps. No sign-in; the plot map and calculators are live with sample data.
import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { PlotMap } from '@/components/plots/PlotMap'
import { sampleLayout } from '@/lib/plots/sample'
import { Calculators } from '@/components/calculators/Calculators'
import { DEFAULT_CALCULATORS } from '@/lib/calculators/settings'

interface Hotspot { x: number; y: number; title: string; text: string }
export interface TourStep { id: string; image?: string; nav: string; title: string; body: string; hotspots: Hotspot[]; /** A live, clickable component instead of a screenshot. */ live?: 'plot-map' | 'calculators' }

const SAMPLE_MAP = sampleLayout()

export function ProductTour({ steps }: { steps: TourStep[] }) {
  const [i, setI] = useState(0)
  const [spot, setSpot] = useState<number | null>(0)
  const go = useCallback((n: number) => { setI(Math.max(0, Math.min(steps.length - 1, n))); setSpot(0) }, [steps.length])
  const step = steps[i]
  const last = i === steps.length - 1

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return
      if (e.key === 'ArrowRight') go(i + 1)
      if (e.key === 'ArrowLeft') go(i - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [i, go])

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      {/* Steps */}
      <nav aria-label="Tour steps" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
        {steps.map((s, n) => (
          <button key={s.id} type="button" onClick={() => go(n)} aria-current={n === i ? 'step' : undefined}
            className={cn('flex min-h-11 shrink-0 items-center gap-3 rounded-xl border px-3 py-2 text-left text-[14px] font-medium transition-colors',
              n === i ? 'border-brand/40 bg-[var(--brand-light)] text-[var(--brand)]' : 'border-default bg-surface text-muted hover:text-[var(--foreground)]')}>
            <span className={cn('grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold',
              n === i ? 'bg-[var(--brand)] text-[#fff]' : n < i ? 'bg-[var(--brand-light)] text-[var(--brand)]' : 'bg-surface-sunken text-muted')}>{n + 1}</span>
            {s.nav}
          </button>
        ))}
      </nav>

      <div className="min-w-0">
        {/* Screen */}
        <div className="surface-raised overflow-hidden rounded-2xl border border-default bg-surface">
          <div className="flex items-center gap-1.5 border-b border-default px-4 py-2.5" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-[var(--border-strong)]" /><span className="size-2.5 rounded-full bg-[var(--border-strong)]" /><span className="size-2.5 rounded-full bg-[var(--border-strong)]" />
            <span className="ml-3 truncate text-[12px] text-muted">re.productionx.in · sample data</span>
          </div>
          {step.live === 'plot-map' ? (
            <div className="p-2 sm:p-4">
              <PlotMap mode="public" {...SAMPLE_MAP} showPrices northDeg={20} initial3d contact={{ phone: null, projectName: 'Sample Enclave', orgName: 'Sample Developers' }} />
            </div>
          ) : step.live === 'calculators' ? (
            <div className="p-3 sm:p-5">
              <Calculators defaults={{ ...DEFAULT_CALCULATORS, charges: [{ label: 'Car parking', kind: 'fixed', amount: 300000 }, { label: 'Club membership', kind: 'fixed', amount: 150000 }, { label: 'Floor rise / PLC', kind: 'per_area', amount: 75 }] }} />
            </div>
          ) : (
          <div className="relative">
            <Image key={step.image} src={step.image!} alt={`${step.title} — RE screen with sample data`} width={2160} height={1350}
              sizes="(min-width: 1024px) 900px, 100vw" priority={i === 0} className="h-auto w-full" />
            {step.hotspots.filter(() => !step.live).map((h, n) => (
              <button key={n} type="button" onClick={() => setSpot(spot === n ? null : n)} aria-label={`${n + 1}: ${h.title}`} aria-expanded={spot === n}
                style={{ left: `${h.x}%`, top: `${h.y}%` }}
                className="absolute grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-[var(--brand)] text-[12px] font-bold text-[#fff] shadow-lg ring-4 ring-[var(--surface)] transition-transform hover:scale-110 sm:size-8">
                <span aria-hidden="true" className="absolute inset-0 rounded-full bg-[var(--brand)] opacity-40 motion-safe:animate-ping" />
                <span className="relative">{n + 1}</span>
              </button>
            ))}
          </div>
          )}
        </div>

        {/* Caption */}
        <div className="mt-5 grid gap-5 md:grid-cols-[1fr_auto] md:items-start">
          <div>
            <p className="text-[13px] font-semibold text-[var(--brand)]">Step {i + 1} of {steps.length}</p>
            <h2 className="mt-1 text-[22px] font-bold tracking-tight">{step.title}</h2>
            <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">{step.body}</p>
            <ol className="mt-4 grid gap-2 sm:grid-cols-2">
              {step.hotspots.map((h, n) => (
                <li key={n}>
                  <button type="button" onClick={() => setSpot(n)}
                    className={cn('flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors',
                      spot === n ? 'border-brand/40 bg-[var(--brand-light)]' : 'border-default bg-surface hover:border-brand/30')}>
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--brand)] text-[12px] font-bold text-[#fff]">{n + 1}</span>
                    <span><span className="block text-[14px] font-semibold">{h.title}</span><span className="mt-0.5 block text-[13px] leading-snug text-muted">{h.text}</span></span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
          <div className="flex gap-2 md:flex-col">
            <button type="button" onClick={() => go(i - 1)} disabled={i === 0}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-default bg-surface px-5 text-[14px] font-semibold disabled:opacity-40">
              <ArrowLeft className="size-4" aria-hidden="true" /> Back
            </button>
            {last ? (
              <Link href="/demo" className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--ink)] px-5 text-[14px] font-semibold text-[#fff] hover:bg-brand">
                Book a demo <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            ) : (
              <button type="button" onClick={() => go(i + 1)}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[var(--ink)] px-5 text-[14px] font-semibold text-[#fff] hover:bg-brand">
                Next <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
