'use client'
// components/theme/ThemeController.tsx — keeps the appearance right after the first paint: on every page change
// (public pages stay light), when the device switches between light and dark, and every few minutes so the
// sunrise/sunset setting changes at the right time without a reload.
import * as React from 'react'
import { usePathname } from 'next/navigation'
import { themeRuntime } from '@/lib/theme/runtime'

const theme = themeRuntime()

export function ThemeController() {
  const pathname = usePathname()
  React.useEffect(() => { theme.apply(pathname ?? undefined) }, [pathname])
  React.useEffect(() => {
    const tick = () => theme.apply()
    const timer = setInterval(tick, 5 * 60_000)
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    mq?.addEventListener?.('change', tick)
    window.addEventListener('storage', tick) // another tab changed the preference
    return () => { clearInterval(timer); mq?.removeEventListener?.('change', tick); window.removeEventListener('storage', tick) }
  }, [])
  return null
}
