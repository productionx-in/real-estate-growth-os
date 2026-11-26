'use client'
// components/notifications/NotificationBell.tsx — the header inbox. An All / Unread toggle, then one card per
// notification: a badge-avatar for its kind, the title with when it happened, the message, a green dot while unread,
// and its action ("Open lead", "Call now", "View map"…) beside "Mark read". Polls every 30 s while the tab is visible.
// Every read and update goes through /api/notifications…, scoped to the signed-in person's own inbox.
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Bell, BellRing, Check, CheckCheck, Clock, Eye, Gift, Hourglass, Map, Phone, Siren, Sparkles, Trophy, Undo2, User } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { kindStyle, notificationHref, timeAgo, type KindStyle, type Tone } from '@/lib/notifications/kinds'
import { PushAlertsToggle } from './PushAlertsToggle'

interface Item { id: string; type: string; title: string; body: string; lead_id: string | null; project_id?: string | null; topic?: string | null; created_at: string; read_at: string | null }

const ICONS: Record<KindStyle['icon'], React.ComponentType<{ className?: string }>> = {
  sparkles: Sparkles, user: User, undo: Undo2, clock: Clock, siren: Siren, phone: Phone, alert: AlertTriangle, eye: Eye, map: Map, hourglass: Hourglass, trophy: Trophy, gift: Gift, bell: Bell,
}
const AVATAR: Record<Tone, string> = { brand: 'bg-brand-light text-brand', success: 'bg-success-bg text-success', warning: 'bg-warning-bg text-warning', danger: 'bg-danger-bg text-danger', info: 'bg-surface-muted text-foreground' }
const BADGE: Record<Tone, string> = { brand: 'bg-brand text-brand-foreground', success: 'bg-success text-success-foreground', warning: 'bg-warning text-warning-foreground', danger: 'bg-danger text-danger-foreground', info: 'bg-foreground text-background' }

export function NotificationBell({ orgId, orgSlug }: { orgId: string; orgSlug: string }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [unread, setUnread] = useState(0)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const panelRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications?orgId=${encodeURIComponent(orgId)}`, { cache: 'no-store' })
      if (!res.ok) return
      const json = await res.json()
      setItems(json.data.items)
      setUnread(json.data.unread)
    } catch {
      // network hiccup: keep the last known state
    }
  }, [orgId])

  useEffect(() => {
    const first = setTimeout(load, 0)
    const timer = setInterval(() => { if (document.visibilityState === 'visible') load() }, 30_000)
    return () => { clearTimeout(first); clearInterval(timer) }
  }, [load])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => { if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey) }
  }, [open])

  async function markRead(payload: { ids: string[] } | { all: true }) {
    // Show it at once; the server's answer follows on the next load.
    const now = new Date().toISOString()
    setItems((p) => p.map((n) => ('all' in payload || payload.ids.includes(n.id) ? { ...n, read_at: n.read_at ?? now } : n)))
    setUnread((u) => ('all' in payload ? 0 : Math.max(0, u - payload.ids.length)))
    await fetch('/api/notifications/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, ...payload }) }).catch(() => undefined)
    load()
  }

  const shown = filter === 'unread' ? items.filter((n) => !n.read_at) : items

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => { setOpen((v) => !v); if (!open) load() }}
        className={cn('relative grid size-9 place-items-center rounded-xl text-[var(--foreground-muted)] transition-all hover:bg-[var(--surface-hover)] pointer-coarse:size-11', open && 'surface-raised bg-surface text-foreground')}
        aria-expanded={open} aria-haspopup="dialog"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      >
        {unread > 0 ? <BellRing className="size-[18px]" aria-hidden /> : <Bell className="size-[18px]" aria-hidden />}
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 h-4 min-w-[16px] rounded-full bg-danger px-1 text-center text-[10px] font-semibold leading-4 text-danger-foreground">{unread > 99 ? '99+' : unread}</span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifications"
          className="anim-side fixed inset-x-2 top-14 z-50 flex max-h-[calc(100dvh-9rem)] sm:max-h-[min(640px,calc(100dvh-5rem))] flex-col overflow-hidden rounded-3xl border border-default bg-surface shadow-[var(--shadow-lg)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-3 sm:w-[420px]">
          <div className="flex items-center justify-between gap-3 border-b border-default px-5 py-4">
            <h2 className="text-[16px] font-semibold text-foreground">🔔 Notifications</h2>
            <div className="flex rounded-xl bg-surface-muted p-0.5 text-[13px]" role="tablist" aria-label="Show">
              {(['all', 'unread'] as const).map((f) => (
                <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
                  className={cn('rounded-lg px-3 py-1.5 font-medium transition-colors', filter === f ? 'bg-surface text-foreground shadow-sm' : 'text-muted hover:text-foreground')}>
                  {f === 'all' ? 'All' : `Unread${unread ? ` · ${unread}` : ''}`}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {shown.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <p className="text-[28px]" aria-hidden>{filter === 'unread' ? '🎉' : '📭'}</p>
                <p className="mt-2 text-[14px] font-medium text-foreground">{filter === 'unread' ? 'You’re all caught up' : 'No notifications yet'}</p>
                <p className="mt-1 text-[12px] text-muted">New leads, follow-ups and wins show up here.</p>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {shown.map((n) => {
                  const k = kindStyle(n.type, n.topic), Icon = ICONS[k.icon], href = notificationHref(orgSlug, n)
                  return (
                    <li key={n.id} className={cn('relative flex gap-3.5 px-5 py-4 transition-colors hover:bg-surface-hover', !n.read_at && 'bg-brand-light/25')}>
                      <span className="relative block size-11 shrink-0">
                        <span className={cn('grid size-11 place-items-center rounded-full text-[20px]', AVATAR[k.tone])} aria-hidden>{k.emoji}</span>
                        <span className={cn('absolute -bottom-0.5 -right-0.5 grid size-5 place-items-center rounded-full ring-2 ring-[var(--surface)]', BADGE[k.tone])} aria-hidden><Icon className="size-3" /></span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="pr-4 text-[14px] leading-snug">
                          <span className="font-semibold text-foreground">{n.title}</span> <span className="whitespace-nowrap text-[12px] text-subtle">{timeAgo(n.created_at)}</span>
                        </p>
                        <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted">{k.label}</p>
                        {n.body && <p className="mt-1 line-clamp-2 text-[13px] text-muted">{n.body}</p>}
                        <div className="mt-2.5 flex flex-wrap gap-2">
                          <Link href={href} onClick={() => { if (!n.read_at) void markRead({ ids: [n.id] }); setOpen(false) }}
                            className="btn-primary inline-flex min-h-8 items-center rounded-lg bg-brand px-3 text-[12px] font-medium text-brand-foreground pointer-coarse:min-h-10">{k.action}</Link>
                          {!n.read_at && (
                            <button onClick={() => void markRead({ ids: [n.id] })} className="btn-secondary inline-flex min-h-8 items-center gap-1 rounded-lg border border-default bg-surface px-3 text-[12px] font-medium text-foreground pointer-coarse:min-h-10">
                              <Check className="size-3.5" aria-hidden /> Mark read
                            </button>
                          )}
                        </div>
                      </div>
                      {!n.read_at && <span className="absolute right-5 top-5 size-2.5 rounded-full bg-success" aria-label="Unread" />}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-default px-5 py-2.5">
            <PushAlertsToggle />
            {unread > 0 && (
              <button onClick={() => void markRead({ all: true })} className="inline-flex items-center gap-1 text-[12px] font-medium text-brand hover:underline">
                <CheckCheck className="size-3.5" aria-hidden /> Mark all read
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
