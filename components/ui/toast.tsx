'use client'
// components/ui/toast.tsx — one feedback pattern for the whole product: success, error and info toasts, with an
// optional action (e.g. Undo). Call toast.success('Saved') from any client component; <Toaster /> is mounted once by
// the workspace and console layouts. Toasts never steal focus; screen readers hear them through a polite live region
// (errors assertive). They leave on their own after 5 s (errors 8 s), pause while hovered, and can be dismissed.
import { useEffect, useState, useSyncExternalStore } from 'react'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

type Tone = 'success' | 'error' | 'info'
export interface ToastItem { id: number; tone: Tone; title: string; description?: string; action?: { label: string; onClick: () => void }; leaving?: boolean; ms: number }
type Options = { description?: string; action?: { label: string; onClick: () => void } }

let items: ToastItem[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => { for (const l of listeners) l() }

function dismiss(id: number) {
  items = items.map((t) => (t.id === id ? { ...t, leaving: true } : t)); emit()
  setTimeout(() => { items = items.filter((t) => t.id !== id); emit() }, 160)
}
function push(tone: Tone, title: string, o: Options = {}): number {
  const id = nextId++
  items = [...items.slice(-3), { id, tone, title, ...o, ms: tone === 'error' ? 8000 : 5000 }]
  emit()
  return id
}

export const toast = Object.assign((title: string, o?: Options) => push('info', title, o), {
  success: (title: string, o?: Options) => push('success', title, o),
  error: (title: string, o?: Options) => push('error', title, o),
  info: (title: string, o?: Options) => push('info', title, o),
  dismiss,
})

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
const ICON = { success: CheckCircle2, error: AlertCircle, info: Info } as const
const TONE = { success: 'text-success', error: 'text-danger', info: 'text-brand' } as const

function Toast({ t }: { t: ToastItem }) {
  const [hover, setHover] = useState(false)
  const Icon = ICON[t.tone]
  useEffect(() => {
    if (hover || t.leaving) return
    const timer = setTimeout(() => dismiss(t.id), t.ms)
    return () => clearTimeout(timer)
  }, [hover, t.id, t.ms, t.leaving])
  return (
    <li role={t.tone === 'error' ? 'alert' : 'status'} data-leaving={t.leaving || undefined} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      className="toast pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-2xl border border-default bg-surface p-3.5 pr-10 [box-shadow:var(--edge-highlight),var(--shadow-xl)]">
      <Icon aria-hidden className={cn('mt-0.5 size-5 shrink-0', TONE[t.tone])} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-foreground">{t.title}</p>
        {t.description && <p className="mt-0.5 text-[12px] text-muted">{t.description}</p>}
        {t.action && (
          <button type="button" onClick={() => { t.action!.onClick(); dismiss(t.id) }}
            className="mt-2 inline-flex min-h-8 items-center rounded-md border border-default px-2.5 text-[12px] font-medium text-brand hover:bg-brand-light">{t.action.label}</button>
        )}
      </div>
      <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="absolute right-2 top-2 rounded-md p-1.5 text-subtle hover:bg-surface-hover hover:text-foreground"><X aria-hidden className="size-4" /></button>
      <span aria-hidden className={cn('toast-timer absolute inset-x-0 bottom-0 h-0.5 opacity-40', t.tone === 'error' ? 'bg-danger' : t.tone === 'success' ? 'bg-success' : 'bg-brand')} style={{ animationDuration: `${t.ms}ms` }} />
    </li>
  )
}

/** Mount once per layout. Bottom-right on larger screens; above the phone tab bar on phones. */
export function Toaster() {
  const list = useSyncExternalStore(subscribe, () => items, () => items)
  return (
    <ol aria-label="Notifications" className="pointer-events-none fixed inset-x-3 bottom-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom)+0.75rem)] z-[60] flex flex-col gap-2 sm:inset-x-auto sm:right-5 sm:bottom-24 sm:w-[360px]">
      {list.map((t) => <Toast key={t.id} t={t} />)}
    </ol>
  )
}
