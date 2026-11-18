'use client'
// components/theme/AppearanceMenu.tsx — the Appearance choice in the account menu.
import * as React from 'react'
import { Monitor, Moon, Sun, Sunrise } from 'lucide-react'
import { themeRuntime, type ThemePreference } from '@/lib/theme/runtime'
import { DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu'

const theme = themeRuntime()
const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'sun', label: 'Sunrise & sunset', icon: Sunrise },
  { value: 'system', label: 'Match device', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

export function AppearanceMenu() {
  // The menu content only renders in the browser (when opened), so reading storage here is safe.
  const [pref, setPref] = React.useState<ThemePreference>(() => (typeof window === 'undefined' ? 'sun' : theme.readPreference()))
  return (
    <>
      <DropdownMenuLabel>Appearance</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={pref} onValueChange={(v) => { theme.setPreference(v as ThemePreference); setPref(v as ThemePreference) }}>
        {OPTIONS.map(({ value, label, icon: Icon }) => (
          <DropdownMenuRadioItem key={value} value={value}><Icon aria-hidden className="text-subtle" /> {label}</DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  )
}
