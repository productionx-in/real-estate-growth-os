'use client'
// components/notifications/DeviceSoundToggle.tsx — My notifications: mute alert sounds on this device only.
import { useEffect, useState } from 'react'
import { Switch } from '@/components/notifications/AlertPreferences'
import { deviceSoundsOn, playSound, setDeviceSounds } from '@/lib/notifications/sounds'

export function DeviceSoundToggle() {
  const [on, setOn] = useState(true)
  // Read after mount: the choice lives in this browser, not on the server.
  useEffect(() => { const t = setTimeout(() => setOn(deviceSoundsOn()), 0); return () => clearTimeout(t) }, [])
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-[13px] font-medium text-foreground">Alert sounds on this device</p>
        <p className="text-[12px] text-muted">The new-lead chime and reminder sounds while RE by PX is open here. Your workspace decides which sounds play.</p>
      </div>
      <Switch on={on} label="Alert sounds on this device" onChange={(v) => { setOn(v); setDeviceSounds(v); if (v) playSound('chime', { force: true }) }} />
    </div>
  )
}
