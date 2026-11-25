'use client'
// components/settings/WhatsAppSettingsForm.tsx — Settings → WhatsApp auto-replies. Owners and admins; the server
// validates and authorises (app/api/settings/workspace). The replies themselves: lib/integrations/whatsapp/auto-reply.ts.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Field, Select, Textarea } from '@/components/ui'
import { normaliseSection, type WhatsAppSettings } from '@/lib/settings/workspace'
import { fillAutoReply } from '@/lib/integrations/whatsapp/auto-reply'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const hourLabel = (h: number) => (h === 0 || h === 24 ? '12 am' : h === 12 ? '12 pm' : h < 12 ? `${h} am` : `${h - 12} pm`)

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <label className="flex items-start gap-2 text-[13px] text-foreground">
      <input type="checkbox" className="mt-0.5 size-4 accent-[var(--brand)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="font-medium">{label}<span className="block text-[12px] font-normal text-muted">{hint}</span></span>
    </label>
  )
}

function Preview({ text }: { text: string }) {
  return <div aria-label="Preview" className="max-w-md whitespace-pre-line rounded-xl rounded-tl-sm border border-default bg-surface-muted px-3 py-2 text-[13px] leading-5">{fillAutoReply(text, 'Priya Sharma') || '—'}</div>
}

export function WhatsAppSettingsForm({ orgId, initial }: { orgId: string; initial: WhatsAppSettings }) {
  const router = useRouter()
  const [w, setW] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const first = Object.values(normaliseSection('whatsapp', w).errors)[0]
    if (first) { setMessage({ tone: 'danger', text: first }); return }
    setBusy(true); setMessage(null)
    try {
      const res = await fetch('/api/settings/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, section: 'whatsapp', value: w }) })
      const out = await res.json().catch(() => ({}))
      setMessage(res.ok ? { tone: 'success', text: 'Saved. New WhatsApp messages get these replies from now on.' } : { tone: 'danger', text: out.error ?? 'Could not save.' })
      if (res.ok) router.refresh()
    } catch { setMessage({ tone: 'danger', text: 'Network error. Please try again.' }) } finally { setBusy(false) }
  }

  return (
    <form className="space-y-6" onSubmit={save}>
      <fieldset className="space-y-3">
        <legend className="sr-only">Welcome message</legend>
        <Toggle checked={w.welcomeEnabled} onChange={(x) => setW({ ...w, welcomeEnabled: x })} label="Welcome new enquiries"
          hint="Sent once, the first time someone writes to your WhatsApp number, during business hours." />
        {w.welcomeEnabled && (
          <div className="grid gap-3 pl-6 md:grid-cols-2">
            <Field label="Welcome message" hint="{{first_name}} becomes their WhatsApp name.">
              <Textarea rows={4} maxLength={1000} value={w.welcomeMessage} onChange={(e) => setW({ ...w, welcomeMessage: e.target.value })} />
            </Field>
            <Preview text={w.welcomeMessage} />
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="sr-only">Away message</legend>
        <Toggle checked={w.awayEnabled} onChange={(x) => setW({ ...w, awayEnabled: x })} label="Reply outside business hours"
          hint="Tells buyers when to expect an answer. At most once every 12 hours per buyer." />
        {w.awayEnabled && (
          <div className="grid gap-3 pl-6 md:grid-cols-2">
            <Field label="Away message" hint="{{first_name}} becomes their WhatsApp name.">
              <Textarea rows={4} maxLength={1000} value={w.awayMessage} onChange={(e) => setW({ ...w, awayMessage: e.target.value })} />
            </Field>
            <Preview text={w.awayMessage} />
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-[13px] font-semibold text-foreground">Business hours (India time)</legend>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Working days">
          {DAYS.map((d, i) => {
            const on = w.workDays.includes(i)
            return (
              <button key={d} type="button" aria-pressed={on} onClick={() => setW({ ...w, workDays: on ? w.workDays.filter((x) => x !== i) : [...w.workDays, i].sort() })}
                className={`min-h-10 min-w-12 rounded-lg border px-3 text-[13px] font-medium ${on ? 'border-brand bg-brand-light text-brand' : 'border-default text-muted hover:bg-surface-hover'}`}>
                {d}
              </button>
            )
          })}
        </div>
        <div className="grid max-w-md grid-cols-2 gap-3">
          <Field label="From">
            <Select value={w.hoursStart} onChange={(e) => setW({ ...w, hoursStart: Number(e.target.value) })}>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </Select>
          </Field>
          <Field label="To">
            <Select value={w.hoursEnd} onChange={(e) => setW({ ...w, hoursEnd: Number(e.target.value) })}>
              {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
            </Select>
          </Field>
        </div>
      </fieldset>

      <p className="text-[12px] text-muted">Automatic replies are never sent to someone who replied STOP, and never in answer to STOP or START.</p>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Button type="submit" loading={busy}>Save WhatsApp settings</Button>
    </form>
  )
}
