'use client'
// components/notifications/LiveAlerts.tsx — lead alerts as banners while REGrow is open: a new lead, a lead still not
// contacted, a follow-up coming up. They drop in at the top like a phone notification, with the workspace's sound.
// The alerts themselves are made on the server (20260093 and the minute job), so they also arrive as phone or desktop
// push with REGrow closed; this only shows the ones that land while someone is looking.
//   * Checks every 15 s while the tab is visible, and at once when the person comes back to it.
//   * Each alert is shown once, in one tab; several at once make one sound (the most important kind).
//   * Opening one marks it read and goes to the lead; "Call" dials from a phone.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BellRing, CalendarClock, Phone, UserPlus, X } from 'lucide-react'
import { loudest, soundFor, type AlertSoundKind, type LeadAlertSettings } from '@/lib/notifications/lead-alerts'
import { playSound, unlockSoundOnInteraction } from '@/lib/notifications/sounds'
import { cn } from '@/lib/utils/cn'

interface Alert { id: string; kind: AlertSoundKind; title: string; body: string; leadId: string | null; phone: string | null; createdAt: string }
type Shown = Alert & { leaving?: boolean }

const POLL_MS = 15_000
const STAY_MS: Record<AlertSoundKind, number> = { newLead: 12_000, reminder: 15_000, followUp: 12_000 }
const MAX_VISIBLE = 3
const SEEN_KEY = 'regrow.alerts.seen'

const LOOK: Record<AlertSoundKind, { icon: typeof UserPlus; label: string; tint: string }> = {
  newLead: { icon: UserPlus, label: 'New lead', tint: 'bg-brand text-brand-foreground' },
  reminder: { icon: BellRing, label: 'Not contacted yet', tint: 'bg-warning text-warning-foreground' },
  followUp: { icon: CalendarClock, label: 'Follow-up', tint: 'bg-success text-success-foreground' },
}

function seenBefore(id: string): boolean {
  try {
    const seen: string[] = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]')
    if (seen.includes(id)) return true
    localStorage.setItem(SEEN_KEY, JSON.stringify([id, ...seen].slice(0, 60)))
  } catch { /* private mode: this tab's own list below still prevents repeats */ }
  return false
}

export function LiveAlerts({ orgId, orgSlug, settings }: { orgId: string; orgSlug: string; settings: LeadAlertSettings }) {
  const router = useRouter()
  const [alerts, setAlerts] = useState<Shown[]>([])
  const [pushHint, setPushHint] = useState(false)
  const since = useRef<string>(new Date().toISOString())
  const shownHere = useRef(new Set<string>())
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const paused = useRef(false)

  const remove = useCallback((id: string) => {
    setAlerts((list) => list.map((a) => (a.id === id ? { ...a, leaving: true } : a)))
    setTimeout(() => setAlerts((list) => list.filter((a) => a.id !== id)), 220)
    const t = timers.current.get(id)
    if (t) clearTimeout(t)
    timers.current.delete(id)
  }, [])

  const schedule = useCallback((a: Alert) => {
    timers.current.set(a.id, setTimeout(function tick() {
      // Hovering or focusing the banners keeps them up.
      if (paused.current) { timers.current.set(a.id, setTimeout(tick, 2000)); return }
      remove(a.id)
    }, STAY_MS[a.kind]))
  }, [remove])

  const check = useCallback(async () => {
    if (document.visibilityState !== 'visible') return
    try {
      const res = await fetch(`/api/notifications/live?orgId=${encodeURIComponent(orgId)}&since=${encodeURIComponent(since.current)}`, { cache: 'no-store' })
      if (!res.ok) return
      const { data } = (await res.json()) as { data: { alerts: Alert[]; now: string } }
      since.current = data.now
      const fresh = data.alerts.filter((a) => !shownHere.current.has(a.id) && !seenBefore(a.id))
      if (!fresh.length) return
      fresh.forEach((a) => { shownHere.current.add(a.id); schedule(a) })
      setAlerts((list) => [...fresh.reverse(), ...list].slice(0, 6))
      const kind = loudest(fresh.map((a) => a.kind))
      const sound = kind ? soundFor(kind, settings) : null
      if (sound) playSound(sound)
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') setPushHint(true)
    } catch { /* offline for a moment: the next check catches up */ }
  }, [orgId, schedule, settings])

  useEffect(() => {
    if (!settings.enabled) return
    const stopUnlock = unlockSoundOnInteraction()
    const first = setTimeout(check, 2000)
    const every = setInterval(check, POLL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    const pending = timers.current
    return () => {
      stopUnlock(); clearTimeout(first); clearInterval(every)
      document.removeEventListener('visibilitychange', onVisible)
      pending.forEach(clearTimeout)
    }
  }, [check, settings.enabled])

  const markRead = (id: string) => {
    fetch('/api/notifications/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, ids: [id] }) }).catch(() => undefined)
  }
  const open = (a: Alert) => {
    markRead(a.id); remove(a.id)
    if (a.leadId) router.push(`/${orgSlug}/leads/${a.leadId}`)
  }

  if (!settings.enabled || alerts.length === 0) return null
  const visible = alerts.slice(0, MAX_VISIBLE)
  const more = alerts.filter((a) => !a.leaving).length - visible.length

  return (
    <div
      role="region"
      aria-label="Lead alerts"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[70] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:top-16 sm:w-[380px] sm:items-stretch"
      onMouseEnter={() => { paused.current = true }}
      onMouseLeave={() => { paused.current = false }}
      onFocus={() => { paused.current = true }}
      onBlur={() => { paused.current = false }}
    >
      {visible.map((a) => {
        const look = LOOK[a.kind]
        const Icon = look.icon
        return (
          <div
            key={a.id}
            data-leaving={a.leaving ? '' : undefined}
            className="alert-banner pointer-events-auto w-full max-w-[420px] overflow-hidden rounded-2xl border border-default bg-surface/95 shadow-lg backdrop-blur-xl"
          >
            <div className="flex items-start gap-3 p-3">
              <span className={cn('mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl', look.tint)} aria-hidden>
                <Icon className="size-[18px]" />
              </span>
              <button type="button" onClick={() => open(a)} className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-md">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{look.label}</span>
                  <span className="shrink-0 text-[11px] text-subtle">now</span>
                </span>
                <span className="mt-0.5 block truncate text-[14px] font-semibold text-foreground">{a.title}</span>
                {a.body && <span className="mt-0.5 block line-clamp-2 text-[13px] text-muted">{a.body}</span>}
              </button>
              <button type="button" onClick={() => remove(a.id)} aria-label="Dismiss" className="-mr-1 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-full text-subtle hover:bg-surface-hover hover:text-foreground">
                <X className="size-4" aria-hidden />
              </button>
            </div>
            {(a.leadId || a.phone) && (
              <div className="flex border-t border-default text-[13px] font-medium">
                {a.phone && (
                  <a href={`tel:${a.phone.replace(/[^\d+]/g, '')}`} onClick={() => { markRead(a.id); remove(a.id) }}
                    className="flex min-h-11 flex-1 items-center justify-center gap-1.5 text-brand hover:bg-surface-hover">
                    <Phone className="size-4" aria-hidden /> Call
                  </a>
                )}
                {a.leadId && (
                  <button type="button" onClick={() => open(a)} className={cn('flex min-h-11 flex-1 items-center justify-center text-foreground hover:bg-surface-hover', a.phone && 'border-l border-default')}>
                    Open lead
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
      {more > 0 && <p className="pointer-events-auto rounded-full bg-surface/95 px-3 py-1 text-[12px] text-muted shadow-sm">+{more} more in your notifications</p>}
      {pushHint && (
        <p className="pointer-events-auto w-full max-w-[420px] rounded-xl bg-surface/95 px-3 py-2 text-[12px] text-muted shadow-sm">
          Get these even when REGrow is closed: <Link href={`/${orgSlug}/settings/notifications`} className="font-medium text-brand hover:underline" onClick={() => setPushHint(false)}>turn on alerts on this device</Link>
        </p>
      )}
    </div>
  )
}
