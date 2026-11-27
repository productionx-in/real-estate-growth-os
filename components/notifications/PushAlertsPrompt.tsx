'use client'
// components/notifications/PushAlertsPrompt.tsx — after sign-in, asks once per device to turn on phone alerts.
// Browsers only show the notification permission prompt after a tap, so this is a banner with a button rather than
// an automatic prompt. "Not now" hides it on this device for 7 days.
import { useEffect, useState } from 'react'
import { BellRing, X } from 'lucide-react'
import { usePushAlerts } from '@/components/notifications/PushAlertsToggle'

const KEY = 'repx:push-prompt-snoozed'

export function PushAlertsPrompt() {
  const { state, error, enable } = usePushAlerts()
  const [snoozed, setSnoozed] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => {
      try { setSnoozed(Number(localStorage.getItem(KEY) ?? 0) > Date.now()) } catch { setSnoozed(false) }
    }, 0)
    return () => clearTimeout(t)
  }, [])
  const snooze = () => { try { localStorage.setItem(KEY, String(Date.now() + 7 * 864e5)) } catch { /* private mode */ } setSnoozed(true) }

  if (snoozed || !(state === 'off' || state === 'busy' || state === 'ios-install' || state === 'denied')) return null
  return (
    <div role="region" aria-label="Phone alerts" className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-brand/20 bg-brand-light/60 px-4 py-2.5 md:px-6">
      <BellRing className="size-4 shrink-0 text-brand" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-[13px]">
        {state === 'ios-install'
          ? 'Get new-lead alerts on this iPhone: tap Share → “Add to Home Screen”, open RE from there, then turn alerts on.'
          : state === 'denied'
            ? 'New-lead alerts are blocked in this browser. Tap the lock icon beside the address, allow Notifications, then reload.'
            : 'Get a phone alert the moment a new lead arrives, even when RE is closed.'}
        {error && <span className="ml-1 text-danger">{error}</span>}
      </p>
      {(state === 'off' || state === 'busy') && (
        <button type="button" onClick={enable} disabled={state === 'busy'}
          className="min-h-9 rounded-full bg-brand px-4 text-[13px] font-semibold text-[#fff] disabled:opacity-60">
          {state === 'busy' ? 'Turning on…' : 'Turn on alerts'}
        </button>
      )}
      <button type="button" onClick={snooze} aria-label="Not now" className="grid size-9 place-items-center rounded-full text-muted hover:text-[var(--foreground)]">
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  )
}

/** The checklist's one-tap version: asks for permission and subscribes this device right there. */
export function EnablePushButton() {
  const { state, enable } = usePushAlerts()
  if (state === 'on') return <span className="text-[12px] font-semibold text-success flex-shrink-0">On</span>
  if (state === 'denied') return <span className="text-[12px] text-warning max-w-[10rem] text-right">Blocked — allow notifications for this site in your browser settings</span>
  if (state === 'ios-install') return <span className="text-[12px] text-muted max-w-[10rem] text-right">iPhone: Add to Home Screen first</span>
  if (state === 'not-configured') return <span className="text-[12px] text-muted max-w-[10rem] text-right">Not available yet — ask RE support</span>
  if (state === 'unsupported') return <span className="text-[12px] text-muted max-w-[10rem] text-right">Not supported in this browser</span>
  return (
    <button type="button" onClick={enable} disabled={state === 'busy' || state === 'loading'}
      className="text-[12px] font-semibold text-brand hover:underline flex-shrink-0 disabled:opacity-60">
      {state === 'busy' ? 'Turning on…' : 'Turn on'}
    </button>
  )
}
