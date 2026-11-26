'use client'
// components/onboarding/SetupChecklist.tsx — "Getting started" card on the overview for owners, admins, managers.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Circle, Rocket, X } from 'lucide-react'
import type { SetupStep } from '@/lib/dal/onboarding'

export function SetupChecklist({ orgId, steps }: { orgId: string; steps: SetupStep[] }) {
  const key = `repx:setup-dismissed:${orgId}`
  const [hidden, setHidden] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => {
      try { setHidden(localStorage.getItem(key) === '1') } catch { setHidden(false) }
    }, 0)
    return () => clearTimeout(t)
  }, [key])

  const required = steps.filter((s) => !s.optional)
  const done = required.filter((s) => s.done).length
  if (hidden || done === required.length) return null
  const next = steps.find((s) => !s.done)

  return (
    <section aria-labelledby="setup-heading" className="mb-6 bg-[var(--surface)] border border-brand/30 rounded-xl p-5 shadow-2xs">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-xl bg-brand-light text-brand flex items-center justify-center flex-shrink-0"><Rocket className="w-5 h-5" aria-hidden="true" /></span>
        <div className="flex-1 min-w-0">
          <h2 id="setup-heading" className="text-[14px] font-semibold">Get RE ready for your team <span className="text-[var(--foreground-muted)] font-normal">· {done} of {required.length} done</span></h2>
          <div className="mt-2 h-1.5 rounded-full bg-[var(--surface-hover)] overflow-hidden" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={required.length}>
            <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${(done / required.length) * 100}%` }} />
          </div>
        </div>
        <button type="button" aria-label="Hide checklist" className="p-1 text-[var(--foreground-subtle)] hover:text-[var(--foreground)]"
          onClick={() => { try { localStorage.setItem(key, '1') } catch { /* private mode */ } setHidden(true) }}>
          <X className="w-4 h-4" />
        </button>
      </div>
      <ol className="mt-4 grid gap-2 sm:grid-cols-2">
        {steps.map((s) => (
          <li key={s.id} className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 ${s.id === next?.id ? 'border-brand/30 bg-brand-light/50' : 'border-[var(--border)]'}`}>
            {s.done
              ? <CheckCircle2 className="w-4 h-4 mt-0.5 text-success flex-shrink-0" aria-label="Done" />
              : <Circle className="w-4 h-4 mt-0.5 text-[var(--foreground-subtle)] flex-shrink-0" aria-label="Not done" />}
            <div className="flex-1 min-w-0">
              <p className={`text-[13px] font-medium ${s.done ? 'text-[var(--foreground-muted)] line-through' : ''}`}>
                {s.title}{s.optional && <span className="ml-1 text-[11px] font-normal text-[var(--foreground-subtle)]">(optional)</span>}
              </p>
              {!s.done && <p className="text-[12px] text-[var(--foreground-muted)]">{s.body}</p>}
            </div>
            {!s.done && <Link href={s.href} className="text-[12px] font-semibold text-brand hover:underline flex-shrink-0">{s.cta}</Link>}
          </li>
        ))}
      </ol>
    </section>
  )
}
