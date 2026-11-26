'use client'
// components/plots/PlotEnquiryForm.tsx — on the public plot map, a buyer asks about an available plot or asks for a
// site visit. Sent to POST /api/public/plot-maps/[token]/enquiry, which creates (or matches) a lead in the developer's
// RE workspace through the normal lead intake; the team schedules any visit in the site-visit workflow.
// Nothing about other buyers is ever shown here.
import { useState } from 'react'
import { CalendarDays, Send } from 'lucide-react'
import { Alert, Button, Field, Input } from '@/components/ui'

export function PlotEnquiryForm({ token, plot }: { token: string; plot: string }) {
  const [kind, setKind] = useState<'enquiry' | 'site_visit'>('enquiry')
  const [form, setForm] = useState({ name: '', phone: '', email: '', visitDate: '', message: '', website: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const today = new Date().toISOString().slice(0, 10)

  async function send(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/public/plot-maps/${token}/enquiry`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, plot, name: form.name, phone: form.phone, email: form.email || undefined, message: form.message || undefined,
          visitDate: kind === 'site_visit' ? form.visitDate : undefined, website: form.website || undefined }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { setError(out.error ?? 'Could not send. Please try again.'); return }
      setDone(true)
    } catch { setError('Network error. Please try again.') } finally { setBusy(false) }
  }

  if (done) return <Alert tone="success">Thank you — the team will contact you {kind === 'site_visit' ? 'to confirm your visit' : 'shortly'}.</Alert>
  return (
    <form onSubmit={send} className="space-y-2 border-t border-default pt-3">
      <div role="radiogroup" aria-label="What would you like?" className="grid grid-cols-2 gap-1.5">
        {(['enquiry', 'site_visit'] as const).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
            className={`min-h-10 rounded-md border px-2 text-[13px] font-medium ${kind === k ? 'border-brand bg-brand-light text-brand' : 'border-default text-foreground hover:bg-surface-hover'}`}>
            {k === 'enquiry' ? <><Send aria-hidden className="mr-1 inline size-3.5" />Enquire</> : <><CalendarDays aria-hidden className="mr-1 inline size-3.5" />Visit the site</>}
          </button>
        ))}
      </div>
      <Field label="Your name"><Input required minLength={2} maxLength={100} autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <Field label="Phone"><Input required type="tel" inputMode="tel" minLength={6} maxLength={20} autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
      <Field label="E-mail (optional)"><Input type="email" maxLength={255} autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
      {kind === 'site_visit' && <Field label="Preferred date"><Input required type="date" min={today} value={form.visitDate} onChange={(e) => setForm({ ...form, visitDate: e.target.value })} /></Field>}
      <Field label="Message (optional)"><Input maxLength={500} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></Field>
      {/* Real visitors never see or fill this field. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" className="w-full" loading={busy}>{kind === 'site_visit' ? 'Request a site visit' : `Ask about plot ${plot}`}</Button>
      <p className="text-[11px] text-subtle">Your details go only to the developer of this project.</p>
    </form>
  )
}
