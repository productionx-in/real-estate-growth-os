'use client'
// app/error.tsx — an unexpected error while rendering a page. Details stay in the logs; the person sees what to do
// next and a reference they can quote to support: the server's digest, or for an error in the browser a "C-" reference
// that is also sent to the server logs (/api/client-errors).
// An error caused by a newer release (this tab still runs the old code) is fixed by reloading, so the page reloads
// once by itself; "Try again" reloads too when the error happened in the browser.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { clientReference, isStaleBuildError } from '@/lib/errors/client'

const RELOAD_KEY = 'regrow:stale-reload-at'

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [ref] = useState(() => error.digest ?? clientReference())
  const stale = isStaleBuildError(error)

  useEffect(() => {
    console.error(error)
    if (stale) {
      // Reload once; if it happens again within a minute, show the page instead of looping.
      let last = 0
      try { last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0) } catch { /* storage blocked */ }
      if (Date.now() - last > 60_000) {
        try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())) } catch { /* storage blocked */ }
        window.location.reload()
        return
      }
    }
    if (!error.digest) {
      const body = JSON.stringify({ ref, name: error.name, message: error.message, path: window.location.pathname, stale })
      try {
        const sent = navigator.sendBeacon?.('/api/client-errors', new Blob([body], { type: 'application/json' }))
        if (!sent) void fetch('/api/client-errors', { method: 'POST', body, keepalive: true }).catch(() => {})
      } catch { /* best effort */ }
    }
  }, [error, ref, stale])

  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-danger-bg">
          <AlertTriangle aria-hidden className="size-6 text-danger" />
        </div>
        <h1 className="text-[18px] font-semibold text-foreground">{stale ? 'REGrow was updated' : 'Something went wrong on this page'}</h1>
        <p className="mt-2 text-[14px] text-muted">
          {stale ? 'A newer version is available. Reload the page to continue — nothing you saved is lost.'
            : 'Your data is safe. Try again — if it keeps happening, contact support and quote the reference below.'}
        </p>
        <p className="mt-3 text-[12px] text-subtle">Reference: <code className="font-mono">{ref}</code></p>
        <div className="mt-6 flex justify-center gap-2">
          <Button onClick={() => (error.digest ? reset() : window.location.reload())}>{stale ? 'Reload' : 'Try again'}</Button>
          <Link href="/select-org" className={buttonVariants({ variant: 'secondary' })}>Go to my workspace</Link>
        </div>
      </div>
    </main>
  )
}
