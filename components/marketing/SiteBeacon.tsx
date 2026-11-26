'use client'
// components/marketing/SiteBeacon.tsx — counts public website page views for Website analytics (platform console).
// No cookie and nothing that identifies a person: a random visit id kept in this tab only (sessionStorage), the page,
// the page before it, and — on the first page — where the visit came from.
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

const KEY = 'repx:visit'

export function SiteBeacon() {
  const path = usePathname()
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as { v: string; n: number; last: string } | null
      if (saved?.last === path) return // a re-render of the same page, not a new view
      const v = saved?.v ?? (crypto.randomUUID?.().replace(/-/g, '').slice(0, 20) ?? Math.random().toString(36).slice(2, 14))
      const n = (saved?.n ?? 0) + 1
      sessionStorage.setItem(KEY, JSON.stringify({ v, n, last: path }))
      const q = new URLSearchParams(location.search)
      const body = JSON.stringify({
        v, n, p: path, f: saved?.last ?? null,
        ...(n === 1 ? { r: document.referrer || null, us: q.get('utm_source'), um: q.get('utm_medium'), uc: q.get('utm_campaign') } : {}),
      })
      if (!navigator.sendBeacon?.('/api/site/pv', new Blob([body], { type: 'application/json' }))) {
        fetch('/api/site/pv', { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(() => {})
      }
    } catch { /* storage blocked or old browser: count nothing */ }
  }, [path])
  return null
}
