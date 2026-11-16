'use client'
// components/notifications/NotificationBell.tsx
// Header inbox: unread badge, latest notifications, click-through to the lead, mark as read.
// Polls every 30 s while the tab is visible (realtime push arrives with the web-push milestone).
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'
import { PushAlertsToggle } from './PushAlertsToggle'

interface Item {
  id: string
  type: string
  title: string
  body: string
  lead_id: string | null
  created_at: string
  read_at: string | null
}

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function NotificationBell({ orgId, orgSlug }: { orgId: string; orgSlug: string }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [unread, setUnread] = useState(0)
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
    // First fetch and periodic refresh both run from timer callbacks (state is set after the fetch resolves).
    const first = setTimeout(load, 0)
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, 30_000)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [load])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  async function markRead(payload: { ids: string[] } | { all: true }) {
    await fetch('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId, ...payload }),
    }).catch(() => undefined)
    load()
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => { setOpen((v) => !v); if (!open) load() }}
        className="relative w-8 h-8 rounded-md flex items-center justify-center text-[var(--foreground-muted)] hover:bg-[var(--surface-hover)] transition-colors"
        title="Notifications"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-semibold leading-4 text-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-[420px] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-lg z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && (
              <button onClick={() => markRead({ all: true })} className="text-xs text-blue-600 hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <PushAlertsToggle />
          {items.length === 0 ? (
            <p className="px-3 py-6 text-sm text-center text-[var(--foreground-muted)]">No notifications yet</p>
          ) : (
            <ul>
              {items.map((n) => (
                <li key={n.id} className={n.read_at ? '' : 'bg-blue-50/60'}>
                  <Link
                    href={n.lead_id ? `/${orgSlug}/leads/${n.lead_id}` : `/${orgSlug}/leads`}
                    onClick={() => { if (!n.read_at) markRead({ ids: [n.id] }); setOpen(false) }}
                    className="block px-3 py-2 border-b border-[var(--border)] hover:bg-[var(--surface-hover)]"
                  >
                    <p className="text-sm font-medium truncate">{n.title}</p>
                    <p className="text-xs text-[var(--foreground-muted)] truncate">{n.body}</p>
                    <p className="text-[11px] text-[var(--foreground-muted)] mt-0.5">{timeAgo(n.created_at)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
