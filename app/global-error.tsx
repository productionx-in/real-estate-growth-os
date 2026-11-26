'use client'
// app/global-error.tsx — last resort when the root layout itself fails. Must render its own <html> and cannot rely
// on the stylesheet having loaded, so it uses inline styles.
import { useEffect } from 'react'
import { isStaleBuildError } from '@/lib/errors/client'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // A newer release (this tab still runs the old code): reload once, never in a loop.
  useEffect(() => {
    if (!isStaleBuildError(error)) return
    let last = 0
    try { last = Number(sessionStorage.getItem('repx:stale-reload-at') ?? 0) } catch { /* storage blocked */ }
    if (Date.now() - last > 60_000) {
      try { sessionStorage.setItem('repx:stale-reload-at', String(Date.now())) } catch { /* storage blocked */ }
      window.location.reload()
    }
  }, [error])
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f8f9fa', color: '#111827' }}>
        <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ maxWidth: 420, textAlign: 'center' }}>
            <h1 style={{ fontSize: 20, margin: 0 }}>RE couldn’t load</h1>
            <p style={{ color: '#4b5563', fontSize: 14 }}>Your data is safe. Please try again in a moment.</p>
            {error.digest && <p style={{ color: '#6b7280', fontSize: 12 }}>Reference: {error.digest}</p>}
            <button
              onClick={() => (error.digest ? reset() : window.location.reload())}
              style={{ marginTop: 12, background: '#4338ca', color: '#fff', border: 0, borderRadius: 6, padding: '8px 14px', fontSize: 14, cursor: 'pointer' }}
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  )
}
