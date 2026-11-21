'use client'
// components/settings/AppearancePicker.tsx — light, dark, device or sunrise/sunset; saved in this browser.
import { useState, useSyncExternalStore } from 'react'
import { Monitor, Moon, Sun, Sunrise } from 'lucide-react'
import { themeRuntime, type ThemePreference } from '@/lib/theme/runtime'
import { cn } from '@/lib/utils/cn'

const OPTIONS: { value: ThemePreference; label: string; hint: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', hint: 'Clean and bright', icon: Sun },
  { value: 'dark', label: 'Dark', hint: 'Easy on the eyes', icon: Moon },
  { value: 'system', label: 'Match device', hint: 'Follows your phone or computer', icon: Monitor },
  { value: 'sun', label: 'Sunrise & sunset', hint: 'Light by day, dark at night', icon: Sunrise },
]

export function AppearancePicker() {
  // The stored choice lives in this browser: read it there (null on the server, so nothing is ticked until hydrated).
  const stored = useSyncExternalStore(() => () => {}, () => themeRuntime().readPreference(), () => null)
  const [picked, setPref] = useState<ThemePreference | null>(null)
  const pref = picked ?? stored
  return (
    <div role="radiogroup" aria-label="Appearance" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {OPTIONS.map(({ value, label, hint, icon: Icon }) => (
        <button key={value} type="button" role="radio" aria-checked={pref === value}
          onClick={() => { themeRuntime().setPreference(value); setPref(value) }}
          className={cn('flex min-h-16 items-start gap-2.5 rounded-lg border p-3 text-left transition-colors',
            pref === value ? 'border-brand bg-brand-light' : 'border-default hover:bg-surface-hover')}>
          <Icon aria-hidden className={cn('mt-0.5 size-4', pref === value ? 'text-brand' : 'text-subtle')} />
          <span>
            <span className="block text-[13px] font-medium text-foreground">{label}</span>
            <span className="block text-[12px] text-muted">{hint}</span>
          </span>
        </button>
      ))}
    </div>
  )
}
