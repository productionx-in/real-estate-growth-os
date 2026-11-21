'use client'
// components/documents/LeadDocuments.tsx — documents shared with this buyer, and creating a new one.
// Create: pick a template (and a unit), preview the filled-in text, create, then copy the link or send it on
// WhatsApp. The server checks who may do this (managers or the lead's salesperson) and freezes the text.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Eye, FileText, Link2Off, MessageCircle, Pencil } from 'lucide-react'
import { Alert, Badge, Button, Field, Input, Select, Textarea } from '@/components/ui'
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog'
import { DocumentBody } from '@/components/documents/DocumentBody'
import type { Letterhead } from '@/lib/documents/letterhead'

export interface DocRow {
  id: string; title: string; token: string; expiresAt: string; revokedAt: string | null
  viewCount: number; firstViewedAt: string | null; lastViewedAt: string | null; createdAt: string; createdBy: string | null
  /** Decided on the server: not turned off and not expired. */
  live: boolean
}
export interface Option { id: string; label: string }

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

export function LeadDocuments({ leadId, leadName, leadPhone, documents, templates, units, canWork }: {
  leadId: string; leadName: string; leadPhone: string
  documents: DocRow[]; templates: Option[]; units: Option[]; canWork: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '')
  const [unitId, setUnitId] = useState('')
  const [days, setDays] = useState(30)
  const [preview, setPreview] = useState<{ title: string; body: string; missing: string[]; letterhead: Letterhead | null } | null>(null)
  // "Edit before sharing": the salesperson fills blanks (________) or adjusts wording for this buyer only.
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const [created, setCreated] = useState<DocRow | null>(null)
  const [createdLink, setCreatedLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  // Full links are built when used (in the browser), so server and browser render the same markup.
  const linkOf = (d: DocRow) => `${window.location.origin}/d/${d.token}`
  const live = (d: DocRow) => d.live

  async function call(url: string, init: RequestInit) {
    setBusy(true); setError(null)
    try {
      const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { setError(out.error ?? 'Something went wrong.'); return null }
      return out
    } catch { setError('Network error. Please try again.'); return null } finally { setBusy(false) }
  }

  async function loadPreview() {
    const out = await call(`/api/leads/${leadId}/documents/preview`, { method: 'POST', body: JSON.stringify({ templateId, unitId: unitId || null }) })
    if (out) { setPreview(out); setText(out.body); setEditing(/_{4,}/.test(out.body)) }
  }
  async function create() {
    const out = await call(`/api/leads/${leadId}/documents`, { method: 'POST', body: JSON.stringify({ templateId, unitId: unitId || null, validDays: days, ...(preview && text !== preview.body ? { body: text } : {}) }) })
    if (out?.document) {
      const doc: DocRow = { ...out.document, live: true }
      setCreated(doc)
      setCreatedLink(linkOf(doc))
      router.refresh()
    }
  }
  async function revoke(d: DocRow) {
    if (!window.confirm(`Turn off the link to “${d.title}”? The buyer will no longer be able to open it.`)) return
    if (await call(`/api/leads/${leadId}/documents/${d.id}`, { method: 'DELETE' })) router.refresh()
  }
  function copy(d: DocRow) {
    navigator.clipboard.writeText(linkOf(d)); setCopied(d.id); setTimeout(() => setCopied(null), 2000)
  }
  const whatsapp = (d: DocRow) =>
    `https://wa.me/${leadPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi ${leadName.split(' ')[0]}, here is your ${d.title}: ${linkOf(d)}`)}`

  const actions = (d: DocRow) => live(d) && (
    <div className="flex flex-wrap gap-1">
      <Button size="sm" variant="secondary" onClick={() => copy(d)}>{copied === d.id ? <Check aria-hidden /> : <Copy aria-hidden />} {copied === d.id ? 'Copied' : 'Copy link'}</Button>
      <Button size="sm" variant="secondary" onClick={() => window.open(whatsapp(d), '_blank', 'noopener,noreferrer')}><MessageCircle aria-hidden /> WhatsApp</Button>
      {canWork && <Button size="sm" variant="ghost" onClick={() => revoke(d)} disabled={busy}><Link2Off aria-hidden /> Turn off</Button>}
    </div>
  )

  return (
    <section className="rounded-lg border border-default bg-surface p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-foreground"><FileText aria-hidden className="size-4 text-brand" /> Documents</h2>
        {canWork && templates.length > 0 && (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setPreview(null); setCreated(null); setError(null); setEditing(false) } }}>
            <DialogTrigger asChild><Button size="sm" variant="secondary">Create document</Button></DialogTrigger>
            <DialogContent title={created ? 'Ready to share' : 'Create a document'} className="max-w-2xl"
              description={created ? `Send this private link to ${leadName}. You’ll see when it’s opened.` : 'Filled in for this buyer. The text is saved as it is now, so later price changes won’t alter it.'}>
              {created ? (
                <div className="space-y-3">
                  <Input readOnly value={createdLink} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} />
                  {actions(created)}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Template">
                      <Select value={templateId} onChange={(e) => { setTemplateId(e.target.value); setPreview(null) }}>
                        {templates.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </Select>
                    </Field>
                    <Field label="Unit (optional)">
                      <Select value={unitId} onChange={(e) => { setUnitId(e.target.value); setPreview(null) }}>
                        <option value="">No unit</option>
                        {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
                      </Select>
                    </Field>
                  </div>
                  <Field label="Link works for (days)">
                    <Input type="number" min={1} max={90} value={days} onChange={(e) => setDays(Math.max(1, Math.min(90, Number(e.target.value) || 30)))} />
                  </Field>
                  {preview && (
                    <>
                      {preview.missing.length > 0 && (
                        <Alert tone="warning">No value yet for: {preview.missing.join(', ')} — these show as “—”. You can type them in below.</Alert>
                      )}
                      {/_{4,}/.test(text) && <Alert tone="info">Fill in the blanks (________) for this buyer before sharing.</Alert>}
                      <div className="flex justify-end">
                        <Button size="sm" variant="ghost" onClick={() => setEditing((e) => !e)}>
                          {editing ? <><Eye aria-hidden /> Show preview</> : <><Pencil aria-hidden /> Edit before sharing</>}
                        </Button>
                      </div>
                      {editing ? (
                        <Field label="Text for this buyer" hint="Changes apply to this document only, not the template.">
                          <Textarea rows={14} value={text} onChange={(e) => setText(e.target.value)} className="font-mono text-[12px]" />
                        </Field>
                      ) : (
                        <div className="max-h-96 overflow-y-auto rounded-md border border-default p-4"><DocumentBody body={text} letterhead={preview.letterhead} /></div>
                      )}
                    </>
                  )}
                  {error && <Alert tone="danger">{error}</Alert>}
                  <DialogFooter>
                    <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
                    {preview
                      ? <Button onClick={create} loading={busy}>Create and get link</Button>
                      : <Button onClick={loadPreview} loading={busy} disabled={!templateId}><Eye aria-hidden /> Preview</Button>}
                  </DialogFooter>
                </div>
              )}
            </DialogContent>
          </Dialog>
        )}
      </div>
      {canWork && templates.length === 0 && <p className="text-[12px] text-muted">No templates yet. A manager can add one under Document templates.</p>}
      {documents.length === 0 ? (
        <p className="text-[12px] text-muted">Nothing shared yet.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {documents.map((d) => (
            <li key={d.id} className="space-y-1.5 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <a href={`/d/${d.token}`} target="_blank" rel="noreferrer" className="text-[13px] font-medium text-foreground hover:text-brand">{d.title}</a>
                {d.revokedAt ? <Badge>Turned off</Badge> : !live(d) ? <Badge>Expired</Badge>
                  : d.viewCount > 0 ? <Badge tone="success">Opened {d.viewCount}×</Badge> : <Badge tone="warning">Not opened yet</Badge>}
              </div>
              <p className="text-[11px] text-muted">
                Sent {when(d.createdAt)}{d.createdBy ? ` by ${d.createdBy}` : ''}
                {d.lastViewedAt ? ` · last opened ${when(d.lastViewedAt)}` : ''}
                {live(d) ? ` · link works until ${new Date(d.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}
              </p>
              {actions(d)}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
