'use client'
// components/notifications/LeadAlertSettingsForm.tsx — Settings → Notification defaults → Lead alerts (owners and
// admins; the API authorises). What it saves is read by the server's alert rules (20260093) and the banners.
import { useState } from 'react'
import { BellRing, CalendarClock, Play, UserPlus } from 'lucide-react'
import { Alert, Button, Input, Select } from '@/components/ui'
import { Switch } from '@/components/notifications/AlertPreferences'
import { ALERT_LIMITS, SOUND_IDS, SOUNDS, type LeadAlertSettings, type SoundId } from '@/lib/notifications/lead-alerts'
import { playSound } from '@/lib/notifications/sounds'

type SoundKey = 'newLeadSound' | 'reminderSound' | 'followUpSound'

export function LeadAlertSettingsForm({ orgId, initial }: { orgId: string; initial: LeadAlertSettings }) {
  const [s, setS] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const set = <K extends keyof LeadAlertSettings>(k: K, v: LeadAlertSettings[K]) => { setS((p) => ({ ...p, [k]: v })); setMsg(null) }
  const off = !s.enabled

  async function submit() {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/settings/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, section: 'alerts', value: s }) })
      const out = await res.json().catch(() => ({}))
      setMsg(res.ok ? { tone: 'success', text: 'Saved. The next alerts follow these settings.' } : { tone: 'danger', text: out.error ?? 'Could not save.' })
    } catch { setMsg({ tone: 'danger', text: 'Network error. Please try again.' }) } finally { setBusy(false) }
  }

  const sound = (key: SoundKey, enabled: boolean, label: string) => (
    <div className="mt-2 flex items-center gap-2">
      <Select aria-label={`${label} sound`} value={s[key]} disabled={off || !enabled || !s.sounds} onChange={(e) => set(key, e.target.value as SoundId)} className="h-9 max-w-[180px]">
        {SOUND_IDS.map((id) => <option key={id} value={id}>{SOUNDS[id]}</option>)}
      </Select>
      <Button type="button" size="sm" variant="secondary" onClick={() => playSound(s[key], { force: true })} aria-label={`Play the ${label.toLowerCase()} sound`}>
        <Play aria-hidden /> Play
      </Button>
    </div>
  )
  const minutes = (key: 'uncontactedMinutes' | 'followUpMinutes', limits: readonly [number, number], enabled: boolean, label: string) => (
    <label className="mt-2 flex items-center gap-2 text-[13px] text-muted">
      {label}
      <Input type="number" inputMode="numeric" min={limits[0]} max={limits[1]} value={Number.isNaN(s[key]) ? '' : s[key]} disabled={off || !enabled}
        onChange={(e) => set(key, e.target.value === '' ? NaN : Math.round(Number(e.target.value)))} className="h-9 w-20" />
      minutes
    </label>
  )

  const row = (icon: React.ReactNode, title: string, hint: string, key: 'newLead' | 'uncontacted' | 'followUp', extra: React.ReactNode) => (
    <li className="flex items-start gap-3 p-4">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-hover text-muted" aria-hidden>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium text-foreground">{title}</p>
        <p className="text-[12px] text-muted">{hint}</p>
        {extra}
      </div>
      <Switch on={s[key]} label={title} disabled={off} onChange={(v) => set(key, v)} />
    </li>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 rounded-lg border border-default p-4">
        <div>
          <p className="text-[14px] font-semibold text-foreground">Lead alerts</p>
          <p className="text-[12px] text-muted">Off turns off everything below for the whole workspace.</p>
        </div>
        <Switch on={s.enabled} label="Lead alerts" onChange={(v) => set('enabled', v)} />
      </div>

      <ul className={`divide-y divide-[var(--border)] rounded-lg border border-default ${off ? 'opacity-60' : ''}`}>
        {row(<UserPlus className="size-4" />, 'New lead', 'As soon as a lead arrives from any source: the person it is assigned to, and owners, admins and managers (with who has it).', 'newLead',
          sound('newLeadSound', s.newLead, 'New lead'))}
        {row(<BellRing className="size-4" />, 'Remind until contacted', 'Keeps reminding the assigned person until someone calls, messages or moves the lead on (for up to 24 hours). Stops when the lead is reassigned; the new owner gets their own.', 'uncontacted',
          <>{minutes('uncontactedMinutes', ALERT_LIMITS.uncontacted, s.uncontacted, 'Every')}{sound('reminderSound', s.uncontacted, 'Reminder')}</>)}
        {row(<CalendarClock className="size-4" />, 'Follow-up reminder', 'Before each follow-up or site visit. A rescheduled one is reminded again for its new time; a cancelled one is not.', 'followUp',
          <>{minutes('followUpMinutes', ALERT_LIMITS.followUp, s.followUp, 'Remind')}{sound('followUpSound', s.followUp, 'Follow-up')}</>)}
      </ul>

      <div className={`flex items-start justify-between gap-4 rounded-lg border border-default p-4 ${off ? 'opacity-60' : ''}`}>
        <div>
          <p className="text-[14px] font-medium text-foreground">Play sounds</p>
          <p className="text-[12px] text-muted">With the alert banners while RE by PX is open. Each person can still mute their own device in My notifications.</p>
        </div>
        <Switch on={s.sounds} label="Play sounds" disabled={off} onChange={(v) => set('sounds', v)} />
      </div>

      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Button type="button" onClick={submit} loading={busy}>Save lead alerts</Button>
    </div>
  )
}
