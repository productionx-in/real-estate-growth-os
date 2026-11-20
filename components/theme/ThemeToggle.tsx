'use client'
// components/theme/ThemeToggle.tsx — one-tap day/night switch. Sets an explicit Light or Dark preference;
// "Sunrise & sunset" and "Match device" stay available in the account menu (AppearanceMenu).
import * as React from 'react'
import { Moon, Sun } from 'lucide-react'
import { themeRuntime } from '@/lib/theme/runtime'
import { cn } from '@/lib/utils/cn'

const theme = themeRuntime()

export function ThemeToggle({ className }: { className?: string }) {
  // null until mounted: the server cannot know the theme, so render a neutral button first.
  const [dark, setDark] = React.useState<boolean | null>(null)
  React.useEffect(() => {
    const read = () => setDark(document.documentElement.getAttribute('data-theme') === 'dark')
    read()
    const obs = new MutationObserver(read)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])
  const label = dark ? 'Switch to day mode' : 'Switch to night mode'
  return (
    <button type="button" aria-label={label} title={label} onClick={() => setDark(theme.setPreference(dark ? 'light' : 'dark') === 'dark')}
      className={cn('grid size-10 place-items-center rounded-lg text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-foreground', className)}>
      {dark ? <Sun className="size-5" aria-hidden="true" /> : <Moon className="size-5" aria-hidden="true" />}
    </button>
  )
}
