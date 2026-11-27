'use client'
// components/calendar/CalendarSync.tsx — "Sync to phone or computer": a private link that puts your RE follow-ups and
// site visits into Google Calendar, Apple Calendar (iPhone, iPad, Mac) or Outlook. Calendar apps check it for changes
// on their own schedule (Apple about hourly; Google can take several hours).
import { useState } from 'react'
import { CalendarSync as SyncIcon, Copy, X } from 'lucide-react'
import { Alert, Button } from '@/components/ui'
import { ModalShell } from '@/components/ui/modal-shell'

export function CalendarSync({ orgId, active }: { orgId: string; active: boolean }) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [on, setOn] = useState(active)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function create() {
    setBusy(true); setError(null)
    const res = await fetch('/api/calendar/feed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId }) })
    const body = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setError(body.error || 'Could not create the link.'); return }
    setUrl(body.url); setOn(true)
  }
  async function stop() {
    setBusy(true); setError(null)
    await fetch(`/api/calendar/feed?orgId=${orgId}`, { method: 'DELETE' }).catch(() => undefined)
    setBusy(false); setUrl(null); setOn(false)
  }

  const webcal = url?.replace(/^https?:/, 'webcal:')
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}><SyncIcon className="size-4" aria-hidden="true" /> Sync to phone or computer</Button>
      {open && (
        <ModalShell onClose={() => setOpen(false)} label="Sync your RE calendar" size="lg">
          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="sync-title" className="text-[17px] font-semibold">Your RE calendar on your phone or computer</h2>
                <p className="mt-1 text-[13px] text-muted">Your follow-ups and site visits appear in the calendar app you already use, with a reminder 10 minutes before. Only you see them; the link shows nothing else.</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-full text-muted hover:text-[var(--foreground)]"><X className="size-4" /></button>
            </div>
            {!url ? (
              <div className="mt-4 space-y-3">
                {on && <p className="text-[13px] text-muted">Sync is on. For security the link is shown only once; make a new link to add another device (the old link stops working).</p>}
                <div className="flex flex-wrap gap-2">
                  <Button onClick={create} loading={busy}>{on ? 'Make a new link' : 'Turn on sync'}</Button>
                  {on && <Button variant="secondary" onClick={stop} disabled={busy}>Stop syncing</Button>}
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="grid gap-2 sm:grid-cols-3">
                  <a className="inline-flex min-h-11 items-center justify-center rounded-xl border border-default px-3 text-center text-[13px] font-semibold hover:bg-surface-hover" href={webcal}>Apple Calendar<br className="hidden sm:block" /> (iPhone, Mac)</a>
                  <a className="inline-flex min-h-11 items-center justify-center rounded-xl border border-default px-3 text-center text-[13px] font-semibold hover:bg-surface-hover" target="_blank" rel="noreferrer" href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal!)}`}>Google Calendar</a>
                  <a className="inline-flex min-h-11 items-center justify-center rounded-xl border border-default px-3 text-center text-[13px] font-semibold hover:bg-surface-hover" target="_blank" rel="noreferrer" href={`https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(url)}&name=${encodeURIComponent('RE')}`}>Outlook</a>
                </div>
                <div className="flex gap-2">
                  <input readOnly value={url} aria-label="Calendar link" onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-md border border-default bg-surface-sunken px-3 text-[12px]" />
                  <Button variant="secondary" size="sm" onClick={() => { navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) }).catch(() => undefined) }}><Copy className="size-4" aria-hidden="true" /> {copied ? 'Copied' : 'Copy'}</Button>
                </div>
                <p className="text-[12px] text-muted">Android: add it in Google Calendar on a computer (Other calendars → From URL); it then appears on your phone. Keep this link private — anyone with it can see your follow-ups.</p>
              </div>
            )}
            {error && <div className="mt-3"><Alert tone="danger">{error}</Alert></div>}
          </div>
        </ModalShell>
      )}
    </>
  )
}
