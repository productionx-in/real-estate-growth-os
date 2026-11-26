'use client'
// components/notifications/PushAlertsToggle.tsx
// "Phone alerts" switch inside the notification panel: registers the service worker and subscribes this
// device to Web Push, so new-lead alerts arrive even when RE by PX is closed. iPhone needs the app installed
// to the home screen first (Safari only allows push for installed web apps), so we explain that instead.
import { useCallback, useEffect, useState } from 'react'
import { Smartphone } from 'lucide-react'

type State = 'loading' | 'unsupported' | 'ios-install' | 'not-configured' | 'denied' | 'off' | 'on' | 'busy'

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return (await navigator.serviceWorker.getRegistration('/')) ?? navigator.serviceWorker.register('/sw.js', { scope: '/' })
}

export function PushAlertsToggle() {
  const [state, setState] = useState<State>('loading')
  const [publicKey, setPublicKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setState(isIos && !standalone ? 'ios-install' : 'unsupported')
      return
    }
    const reg = await registration()
    const sub = await reg.pushManager.getSubscription()
    const res = await fetch(`/api/push/subscription${sub ? `?endpoint=${encodeURIComponent(sub.endpoint)}` : ''}`, { cache: 'no-store' })
    if (!res.ok) { setState('unsupported'); return }
    const { data } = await res.json()
    setPublicKey(data.publicKey)
    if (!data.publicKey) setState('not-configured')
    else if (Notification.permission === 'denied') setState('denied')
    else setState(sub && data.subscribed ? 'on' : 'off')
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { refresh().catch(() => setState('unsupported')) }, 0)
    return () => clearTimeout(t)
  }, [refresh])

  async function enable() {
    if (!publicKey) return
    setState('busy'); setError(null)
    try {
      if ((await Notification.requestPermission()) !== 'granted') { setState('denied'); return }
      const reg = await registration()
      await navigator.serviceWorker.ready
      const sub = (await reg.pushManager.getSubscription())
        ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }))
      const res = await fetch('/api/push/subscription', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub.toJSON()) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not turn on alerts')
      setState('on')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not turn on alerts')
      setState('off')
    }
  }

  async function disable() {
    setState('busy'); setError(null)
    try {
      const sub = await (await registration()).pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/subscription', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) })
        await sub.unsubscribe()
      }
      setState('off')
    } catch {
      setState('on')
    }
  }

  if (state === 'loading' || state === 'unsupported' || state === 'not-configured') return null

  return (
    <div className="px-3 py-2.5 border-b border-[var(--border)] bg-[var(--background)]">
      <div className="flex items-center gap-2">
        <Smartphone className="w-4 h-4 text-[var(--foreground-muted)] flex-shrink-0" aria-hidden="true" />
        <span className="text-xs font-medium flex-1">Alerts on this device</span>
        {(state === 'on' || state === 'off' || state === 'busy') && (
          <button type="button" role="switch" aria-checked={state === 'on'} disabled={state === 'busy'}
            onClick={state === 'on' ? disable : enable}
            className={`relative w-9 h-5 rounded-full transition-colors disabled:opacity-50 ${state === 'on' ? 'bg-success' : 'bg-strong'}`}>
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-surface shadow transition-all ${state === 'on' ? 'left-[18px]' : 'left-0.5'}`} />
            <span className="sr-only">Alerts on this device</span>
          </button>
        )}
      </div>
      {state === 'off' && <p className="mt-1 text-[11px] text-[var(--foreground-muted)]">Get new-lead alerts even when RE by PX is closed.</p>}
      {state === 'denied' && <p className="mt-1 text-[11px] text-warning">Notifications are blocked for this site. Allow them in your browser settings, then reopen this panel.</p>}
      {state === 'ios-install' && <p className="mt-1 text-[11px] text-[var(--foreground-muted)]">On iPhone: tap Share → “Add to Home Screen”, open RE by PX from there, then turn alerts on.</p>}
      {error && <p className="mt-1 text-[11px] text-danger">{error}</p>}
    </div>
  )
}
