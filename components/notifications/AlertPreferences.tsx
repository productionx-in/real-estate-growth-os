'use client'
// components/notifications/AlertPreferences.tsx — Settings → My notifications: which alerts reach your phone or
// computer, quiet hours, and the weekly digest. Your own choices only (app/api/account/notifications).
import { useState } from 'react'
import { Alert, Button, Field, Input } from '@/components/ui'
import { ALERTS, ALERT_TYPES, type AlertType, type PersonPrefs, type TeamDefaults } from '@/lib/notifications/prefs'

function Switch({ on, label, onChange, disabled }: { on: boolean; label: string; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${on ? 'bg-brand' : 'border border-default bg-surface-hover'}`}>
      <span className={`inline-block size-5 rounded-full bg-surface shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  )
}

async function save(body: unknown): Promise<string | null> {
  try {
    const res = await fetch('/api/account/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) return null
    return (await res.json().catch(() => ({}))).error ?? 'Could not save.'
  } catch { return 'Network error. Please try again.' }
}

export function AlertPreferences({ initial, team }: { initial: PersonPrefs; team: TeamDefaults }) {
  const [prefs, setPrefs] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const effective = (t: AlertType) => prefs.push[t] ?? team.push[t]
  const setType = (t: AlertType, on: boolean) => {
    const push = { ...prefs.push }
    if (on === team.push[t]) delete push[t]; else push[t] = on // same as the team default: follow it
    setPrefs({ ...prefs, push })
  }
  async function submit() {
    setBusy(true); setMsg(null)
    const err = await save({ prefs })
    setBusy(false)
    setMsg(err ? { tone: 'danger', text: err } : { tone: 'success', text: 'Saved. Everything still appears in your inbox in REGrow.' })
  }
  return (
    <div className="space-y-5">
      <ul className="divide-y divide-[var(--border)] rounded-lg border border-default">
        {ALERT_TYPES.map((t) => (
          <li key={t} className="flex items-start justify-between gap-4 p-3">
            <div>
              <p className="text-[13px] font-medium text-foreground">{ALERTS[t].label}</p>
              <p className="text-[12px] text-muted">
                {ALERTS[t].hint}{' '}
                {prefs.push[t] === undefined ? <span className="text-subtle">Team default.</span> : (
                  <button type="button" className="text-brand underline" onClick={() => setType(t, team.push[t])}>Use team default ({team.push[t] ? 'on' : 'off'})</button>
                )}
              </p>
            </div>
            <Switch on={effective(t)} label={ALERTS[t].label} onChange={(v) => setType(t, v)} />
          </li>
        ))}
      </ul>
      <fieldset className="space-y-3 rounded-lg border border-default p-3">
        <legend className="px-1 text-[13px] font-semibold text-foreground">Quiet hours</legend>
        <label className="flex items-center gap-2 text-[13px] text-foreground">
          <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={prefs.quiet.enabled} onChange={(e) => setPrefs({ ...prefs, quiet: { ...prefs.quiet, enabled: e.target.checked } })} />
          No alerts on my devices between
        </label>
        <div className="grid max-w-sm grid-cols-2 gap-3">
          <Field label="From (India time)"><Input type="time" value={prefs.quiet.start} disabled={!prefs.quiet.enabled} onChange={(e) => setPrefs({ ...prefs, quiet: { ...prefs.quiet, start: e.target.value } })} /></Field>
          <Field label="Until"><Input type="time" value={prefs.quiet.end} disabled={!prefs.quiet.enabled} onChange={(e) => setPrefs({ ...prefs, quiet: { ...prefs.quiet, end: e.target.value } })} /></Field>
        </div>
        <label className="flex items-start gap-2 text-[13px] text-foreground">
          <input type="checkbox" className="mt-0.5 size-4 accent-[var(--brand)]" checked={prefs.quiet.allowUrgent} disabled={!prefs.quiet.enabled}
            onChange={(e) => setPrefs({ ...prefs, quiet: { ...prefs.quiet, allowUrgent: e.target.checked } })} />
          <span>Still alert me about new leads and missed response targets<span className="block text-[12px] text-muted">A lead called within minutes is far more likely to buy.</span></span>
        </label>
      </fieldset>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Button type="button" onClick={submit} loading={busy}>Save alert choices</Button>
    </div>
  )
}

export function WeeklyDigestToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-4 rounded-lg border border-default p-3">
        <div>
          <p className="text-[14px] font-medium">Weekly digest</p>
          <p className="text-[12px] text-muted">Each Monday at 8 AM: last week’s leads and sources compared with the week before, response times, site visits, bookings, why leads were lost, and each person’s numbers.</p>
        </div>
        <Switch on={on} label="Weekly digest e-mail" disabled={busy} onChange={async (next) => {
          setBusy(true); setErr(null)
          const e = await save({ weeklyDigest: next })
          setBusy(false)
          if (e) setErr(e); else setOn(next)
        }} />
      </div>
      {err && <Alert tone="danger">{err}</Alert>}
    </div>
  )
}

export function TeamAlertDefaults({ orgId, initial }: { orgId: string; initial: TeamDefaults }) {
  const [team, setTeam] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  async function submit() {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/settings/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, section: 'notifications', value: team }) })
      const out = await res.json().catch(() => ({}))
      setMsg(res.ok ? { tone: 'success', text: 'Saved. People who haven’t made their own choice follow these defaults.' } : { tone: 'danger', text: out.error ?? 'Could not save.' })
    } catch { setMsg({ tone: 'danger', text: 'Network error. Please try again.' }) } finally { setBusy(false) }
  }
  return (
    <div className="space-y-4">
      <ul className="divide-y divide-[var(--border)] rounded-lg border border-default">
        {ALERT_TYPES.map((t) => (
          <li key={t} className="flex items-start justify-between gap-4 p-3">
            <div>
              <p className="text-[13px] font-medium text-foreground">{ALERTS[t].label}</p>
              <p className="text-[12px] text-muted">{ALERTS[t].hint}</p>
            </div>
            <Switch on={team.push[t]} label={ALERTS[t].label} onChange={(v) => setTeam({ push: { ...team.push, [t]: v } })} />
          </li>
        ))}
      </ul>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Button type="button" onClick={submit} loading={busy}>Save team defaults</Button>
    </div>
  )
}
