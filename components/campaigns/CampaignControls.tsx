'use client'
// components/campaigns/CampaignControls.tsx — forms and buttons for marketing campaigns (lib/dal/campaigns.ts).
// Every action calls /api/campaigns, which authorises again; these only hide what the server would refuse.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Send, Trash2, Users } from 'lucide-react'
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui'
import { personalise } from '@/lib/campaigns/rules'

async function call(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    return { ok: res.ok, data: await res.json().catch(() => ({})) }
  } catch {
    return { ok: false, data: { error: 'Could not reach RE by PX. Check your connection and try again.' } }
  }
}
const errorOf = (d: Record<string, unknown>) => (typeof d.error === 'string' ? d.error : 'Something went wrong. Try again.')

type SegmentOption = { id: string; name: string; count: number }

export function NewCampaignForm({ orgId, orgSlug, segments, whatsappReady }: { orgId: string; orgSlug: string; segments: SegmentOption[]; whatsappReady: boolean }) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [channel, setChannel] = useState<'email' | 'whatsapp'>('email')
  const [segmentId, setSegmentId] = useState(segments[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const { ok, data } = await call('/api/campaigns', 'POST', { orgId, name, channel, ...(segmentId ? { segmentId } : {}) })
    setBusy(false)
    if (!ok) return setError(errorOf(data))
    router.push(`/${orgSlug}/campaigns/${(data.campaign as { id: string }).id}`)
  }
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <Field label="Name" required hint="Only your team sees this.">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required placeholder="e.g. Diwali offer — Seaview Heights" />
      </Field>
      <Field label="Channel" required>
        <Select value={channel} onChange={(e) => setChannel(e.target.value as 'email' | 'whatsapp')}>
          <option value="email">E-mail</option>
          <option value="whatsapp" disabled={!whatsappReady}>WhatsApp{whatsappReady ? '' : ' (connect WhatsApp first)'}</option>
        </Select>
      </Field>
      <Field label="Send to" className="sm:col-span-2" hint="A segment from Leads → Segments. You can change it before sending.">
        <Select value={segmentId} onChange={(e) => setSegmentId(e.target.value)}>
          {segments.length === 0 && <option value="">No segments yet</option>}
          {segments.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.count} {s.count === 1 ? 'lead' : 'leads'})</option>)}
        </Select>
      </Field>
      {error && <Alert tone="danger" className="sm:col-span-2">{error}</Alert>}
      <div className="sm:col-span-2"><Button type="submit" disabled={busy || !name.trim()}>{busy ? 'Creating…' : 'Create draft'}</Button></div>
    </form>
  )
}

type Template = { name: string; language: string; body: string; params: number }
type WaOption = { connectionId: string; label: string; templates: Template[] }

export function DraftEditor({ orgId, campaign, segments, whatsapp }: {
  orgId: string
  campaign: { id: string; name: string; channel: 'email' | 'whatsapp'; segmentId: string | null; subject: string | null; body: string | null; waConnectionId: string | null; waTemplateName: string | null; waLanguage: string | null }
  segments: SegmentOption[]
  whatsapp: WaOption[]
}) {
  const router = useRouter()
  const [name, setName] = useState(campaign.name)
  const [segmentId, setSegmentId] = useState(campaign.segmentId ?? '')
  const [subject, setSubject] = useState(campaign.subject ?? '')
  const [body, setBody] = useState(campaign.body ?? '')
  const pick = campaign.waConnectionId && campaign.waTemplateName ? `${campaign.waConnectionId}|${campaign.waTemplateName}|${campaign.waLanguage}` : ''
  const [template, setTemplate] = useState(pick)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const email = campaign.channel === 'email'
  const [conn, tname, tlang] = template.split('|')
  const chosen = whatsapp.find((o) => o.connectionId === conn)?.templates.find((t) => t.name === tname && t.language === tlang)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null); setSaved(false)
    const payload = email
      ? { orgId, name, segmentId: segmentId || null, subject, body }
      : { orgId, name, segmentId: segmentId || null, waConnectionId: conn || null, waTemplateName: tname || null, waLanguage: tlang || null }
    const { ok, data } = await call(`/api/campaigns/${campaign.id}`, 'PATCH', payload)
    setBusy(false)
    if (!ok) return setError(errorOf(data))
    setSaved(true); router.refresh()
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required /></Field>
        <Field label="Send to" required>
          <Select value={segmentId} onChange={(e) => setSegmentId(e.target.value)}>
            <option value="">Choose a segment…</option>
            {segments.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.count})</option>)}
          </Select>
        </Field>
      </div>
      {email ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <Field label="Subject" required><Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={150} placeholder="New 3 BHK homes at Seaview Heights" /></Field>
            <Field label="Message" required hint="Plain text. Leave a blank line between paragraphs. {{first_name}} becomes each buyer’s first name. An unsubscribe link is added automatically.">
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} rows={10} placeholder={'Hi {{first_name}},\n\nWe have opened bookings for…'} />
            </Field>
          </div>
          <div aria-label="Preview" className="rounded-xl border border-default bg-surface-muted p-4">
            <p className="text-[12px] font-medium uppercase tracking-wide text-subtle">Preview (for a buyer named Priya)</p>
            <p className="mt-2 text-[15px] font-semibold">{personalise(subject || 'Subject', 'Priya')}</p>
            <div className="mt-2 space-y-3 text-[14px] leading-6">
              {(personalise(body, 'Priya') || 'Your message appears here.').split(/\n\s*\n/).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>)}
            </div>
            <p className="mt-4 border-t border-default pt-2 text-[12px] text-muted">Unsubscribe from these e-mails</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {whatsapp.every((o) => o.templates.length === 0) ? (
            <Alert tone="warning" title="No approved marketing templates">
              WhatsApp only allows approved <strong>Marketing</strong> templates for campaigns. Create one in Meta WhatsApp Manager, wait for approval,
              then sync templates in Integrations → WhatsApp. Templates with more than one blank are not offered (only the first name can be filled in).
            </Alert>
          ) : (
            <Field label="Approved marketing template" required hint="A blank ({{1}}) is filled with the buyer’s first name.">
              <Select value={template} onChange={(e) => setTemplate(e.target.value)}>
                <option value="">Choose a template…</option>
                {whatsapp.map((o) => (
                  <optgroup key={o.connectionId} label={o.label}>
                    {o.templates.map((t) => <option key={`${t.name}|${t.language}`} value={`${o.connectionId}|${t.name}|${t.language}`}>{t.name} ({t.language})</option>)}
                  </optgroup>
                ))}
              </Select>
            </Field>
          )}
          {chosen && (
            <div aria-label="Preview" className="max-w-md rounded-xl border border-default bg-surface-muted p-4 text-[14px] leading-6 whitespace-pre-line">
              {chosen.body.replace(/\{\{\s*1\s*\}\}/g, 'Priya')}
            </div>
          )}
        </div>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" disabled={busy}>{busy ? 'Saving…' : 'Save draft'}</Button>
        {saved && <span role="status" className="text-[13px] text-success">Saved</span>}
      </div>
    </form>
  )
}

const SKIP: Record<string, string> = {
  no_address: 'no address', invalid_address: 'address not valid', opted_out: 'opted out', duplicate: 'duplicate address', junk: 'junk',
}

/** Who it would reach, the consent confirmation, and the send button. */
export function SendPanel({ orgId, orgSlug, campaignId, channel, missing }: { orgId: string; orgSlug: string; campaignId: string; channel: 'email' | 'whatsapp'; missing: string[] }) {
  const router = useRouter()
  const [preview, setPreview] = useState<{ willSend: number; skipped: Record<string, number> } | null>(null)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function check() {
    setBusy(true); setError(null)
    const { ok, data } = await call(`/api/campaigns/${campaignId}/preview?orgId=${encodeURIComponent(orgId)}`, 'GET')
    setBusy(false)
    if (!ok) return setError(errorOf(data))
    setPreview(data as unknown as { willSend: number; skipped: Record<string, number> })
  }
  async function send() {
    if (!preview) return
    if (!window.confirm(`Send this ${channel === 'email' ? 'e-mail' : 'WhatsApp message'} to ${preview.willSend} ${preview.willSend === 1 ? 'person' : 'people'}? This cannot be undone.`)) return
    setBusy(true); setError(null)
    const { ok, data } = await call(`/api/campaigns/${campaignId}/send`, 'POST', { orgId, consent: true })
    setBusy(false)
    if (!ok) return setError(errorOf(data))
    router.refresh()
  }
  if (missing.length) {
    return <Alert tone="info" title="Before you can send">{missing.join(' ')} Save the draft after each change.</Alert>
  }
  return (
    <div className="space-y-3">
      <Button variant="secondary" onClick={check} disabled={busy}><Users aria-hidden /> {preview ? 'Check again' : 'Check who will receive it'}</Button>
      {preview && (
        <div className="space-y-3 rounded-xl border border-default p-4">
          <p className="text-[14px]"><span className="text-[20px] font-semibold tabular-nums">{preview.willSend}</span> {preview.willSend === 1 ? 'person' : 'people'} will receive it.</p>
          {Object.keys(preview.skipped).length > 0 && (
            <p className="text-[13px] text-muted">Left out: {Object.entries(preview.skipped).map(([k, n]) => `${n} ${SKIP[k] ?? k}`).join(', ')}.</p>
          )}
          <label className="flex items-start gap-2 text-[13px]">
            <input type="checkbox" className="mt-1 size-4" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>These people enquired with us or agreed to hear from us, and I may send them this {channel === 'email' ? 'e-mail' : 'message'}. Anyone who has opted out is left out automatically.</span>
          </label>
          <Button onClick={send} disabled={busy || !consent || preview.willSend === 0}><Send aria-hidden /> {busy ? 'Starting…' : `Send to ${preview.willSend}`}</Button>
        </div>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
      <p className="text-[12px] text-muted">Messages go out in batches over the next minutes; this page shows each result. <a className="text-brand hover:underline" href={`/${orgSlug}/leads/segments`}>Edit segments</a></p>
    </div>
  )
}

export function CancelCampaignButton({ orgId, campaignId, draft, listHref }: { orgId: string; campaignId: string; draft: boolean; listHref: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function go() {
    const msg = draft ? 'Delete this draft?' : 'Stop this campaign? Messages already sent stay sent; nothing further goes out.'
    if (!window.confirm(msg)) return
    setBusy(true); setError(null)
    const { ok, data } = draft
      ? await call(`/api/campaigns/${campaignId}?orgId=${encodeURIComponent(orgId)}`, 'DELETE')
      : await call(`/api/campaigns/${campaignId}/cancel`, 'POST', { orgId })
    setBusy(false)
    if (!ok) return setError(errorOf(data))
    if (draft) router.push(listHref)
    router.refresh()
  }
  return (
    <div className="space-y-1">
      <Button variant="secondary" size="sm" onClick={go} disabled={busy}><Trash2 aria-hidden /> {draft ? 'Delete draft' : 'Stop sending'}</Button>
      {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
    </div>
  )
}
