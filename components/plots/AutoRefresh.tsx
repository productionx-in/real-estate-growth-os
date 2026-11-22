'use client'
// components/plots/AutoRefresh.tsx — re-reads the page's server data every `seconds` while the tab is visible, and at
// once when the tab comes back, so plot statuses follow the inventory without a reload. Nothing is refreshed while
// the tab is hidden.
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter()
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') router.refresh() }
    const t = setInterval(tick, seconds * 1000)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick) }
  }, [router, seconds])
  return null
}
