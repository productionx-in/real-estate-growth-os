'use client'
// components/leads/SegmentControls.tsx — the buttons and small forms for lead segments (lib/dal/segments.ts).
// Every action calls /api/segments, which authorises again; these only hide what the server would refuse.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ListPlus, Trash2 } from 'lucide-react'
import { Alert, Button, Field, Input, Textarea } from '@/components/ui'
import type { LeadFilters } from '@/lib/leads/view-filters'

async function send(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  try {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
    return { ok: res.ok, data: await res.json().catch(() => ({})) }
  } catch {
    return { ok: false, data: { error: 'Could not reach RE by PX. Check your connection and try again.' } }
  }
}
const errorOf = (d: Record<string, unknown>) => (typeof d.error === 'string' ? d.error : 'Something went wrong. Try again.')

/** Creates a dynamic segment from filters (from the Leads page) or an empty fixed list. */
export function NewSegmentForm({ orgId, orgSlug, filters, criteria }: {
  orgId: string; orgSlug: string; filters: LeadFilters | null; criteria: string[]
}) {
  const router = useRouter()
  const [kind, setKind] = useState<'dynamic' | 'fixed'>(filters ? 'dynamic' : 'fixed')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const body = kind === 'dynamic'
      ? { orgId, kind, name, description, filters }
      : { orgId, kind, name, description, ...(filters ? { snapshotFilters: filters } : {}) }
    const { ok, data } = await send('/api/segments', 'POST', body)
    setBusy(false)
    if (!ok) return setError(errorOf(data))
    const seg = data.segment as { id: string }
    router.push(`/${orgSlug}/leads/segments/${seg.id}`)
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {filters ? (
        <fieldset className="space-y-2">
          <legend className="text-[13px] font-medium">Type</legend>
          <label className="flex items-start gap-2 text-[13px]">
            <input type="radio" name="kind" className="mt-1" checked={kind === 'dynamic'} onChange={() => setKind('dynamic')} />
            <span><span className="font-medium">Dynamic segment</span> <span className="text-muted">— always the leads matching these filters; new leads join on their own.</span></span>
          </label>
          <label className="flex items-start gap-2 text-[13px]">
            <input type="radio" name="kind" className="mt-1" checked={kind === 'fixed'} onChange={() => setKind('fixed')} />
            <span><span className="font-medium">Fixed list</span> <span className="text-muted">— the leads matching now, kept as they are. Add or remove leads by hand later.</span></span>
          </label>
          <ul className="flex flex-wrap gap-1.5 pt-1">
            {criteria.map((c) => <li key={c} className="rounded-full border border-default bg-surface-muted px-2 py-0.5 text-[12px]">{c}</li>)}
          </ul>
        </fieldset>
      ) : (
        <p className="text-[13px] text-muted">
          A fixed list starts empty; add leads from a lead&apos;s page (More → Add to list). For a dynamic segment, filter
          the Leads page and choose <span className="font-medium text-foreground">Save as segment</span>, or start from a template below.
        </p>
      )}
      <Field label="Name" required>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required placeholder={kind === 'dynamic' ? 'e.g. Hot buyers, Pune' : 'e.g. Diwali offer invitees'} />
      </Field>
      <Field label="Description" hint="Optional. What the segment is for, so the team uses it the same way.">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} rows={2} />
      </Field>
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" disabled={busy || !name.trim()}>{busy ? 'Saving…' : kind === 'dynamic' ? 'Create segment' : 'Create list'}</Button>
    </form>
  )
}

/** One click: create a starter segment from a template. */
export function UseTemplateButton({ orgId, orgSlug, template }: { orgId: string; orgSlug: string; template: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function go() {
    setBusy(true); setError(null)
    const { ok, data } = await send('/api/segments', 'POST', { orgId, kind: 'dynamic', template })
    setBusy(false)
    if (!ok) return setError(errorOf(data))
    router.push(`/${orgSlug}/leads/segments/${(data.segment as { id: string }).id}`)
    router.refresh()
  }
  return (
    <div className="space-y-1">
      <Button size="sm" variant="secondary" onClick={go} disabled={busy}>{busy ? 'Adding…' : 'Use template'}</Button>
      {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
    </div>
  )
}

/** Rename, describe, freeze into a list (dynamic) or delete a segment. */
export function SegmentActions({ orgId, orgSlug, segment, snapshot }: {
  orgId: string; orgSlug: string
  segment: { id: string; name: string; description: string | null; kind: 'dynamic' | 'fixed' }
  /** Dynamic segments: their filters, to save the current leads as a fixed list. */
  snapshot: LeadFilters | null
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(segment.name)
  const [description, setDescription] = useState(segment.description ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(null)
    const { ok, data } = await send(`/api/segments/${segment.id}`, 'PATCH', { orgId, name, description })
    setBusy(false)
    if (!ok) return setError(errorOf(data))
    setEditing(false); router.refresh()
  }
  async function remove() {
    if (!window.confirm(`Delete “${segment.name}”? The leads themselves are not affected.`)) return
    setBusy(true); setError(null)
    const { ok, data } = await send(`/api/segments/${segment.id}?orgId=${encodeURIComponent(orgId)}`, 'DELETE')
    setBusy(false)
    if (!ok) return setError(errorOf(data))
    router.push(`/${orgSlug}/leads/segments`); router.refresh()
  }
  async function freeze() {
    setBusy(true); setError(null)
    const day = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }).format(new Date())
    const { ok, data } = await send('/api/segments', 'POST', { orgId, kind: 'fixed', name: `${segment.name} (${day})`.slice(0, 60), snapshotFilters: snapshot })
    setBusy(false)
    if (!ok) return setError(errorOf(data))
    router.push(`/${orgSlug}/leads/segments/${(data.segment as { id: string }).id}`); router.refresh()
  }

  if (editing) {
    return (
      <form onSubmit={save} className="w-full max-w-md space-y-3">
        <Field label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required /></Field>
        <Field label="Description"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} rows={2} /></Field>
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={busy || !name.trim()}>Save</Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
        </div>
      </form>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Rename</Button>
      {snapshot && <Button size="sm" variant="secondary" onClick={freeze} disabled={busy} title="Keep today’s matching leads as a fixed list">Save as fixed list</Button>}
      <Button size="sm" variant="secondary" onClick={remove} disabled={busy}><Trash2 aria-hidden /> Delete</Button>
      {error && <p role="alert" className="w-full text-[12px] text-danger">{error}</p>}
    </div>
  )
}

/** Removes one lead from a fixed list. */
export function RemoveFromListButton({ orgId, segmentId, leadId, leadName }: { orgId: string; segmentId: string; leadId: string; leadName: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  async function go() {
    setBusy(true)
    const { ok, data } = await send(`/api/segments/${segmentId}/leads`, 'DELETE', { orgId, leadIds: [leadId] })
    setBusy(false)
    if (!ok) return window.alert(errorOf(data))
    router.refresh()
  }
  return (
    <button type="button" onClick={go} disabled={busy} aria-label={`Remove ${leadName} from this list`}
      className="inline-flex min-h-9 items-center rounded-md px-2 text-[12px] font-medium text-muted hover:bg-surface-hover hover:text-danger disabled:opacity-50">
      Remove
    </button>
  )
}

/** On a lead's page: add the lead to (or take it out of) the organisation's fixed lists. */
export function AddToListMenu({ orgId, orgSlug, leadId, lists }: {
  orgId: string; orgSlug: string; leadId: string; lists: { id: string; name: string; member: boolean }[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  async function toggle(l: { id: string; member: boolean }) {
    setBusy(l.id); setError(null)
    const { ok, data } = await send(`/api/segments/${l.id}/leads`, l.member ? 'DELETE' : 'POST', { orgId, leadIds: [leadId] })
    setBusy(null)
    if (!ok) return setError(errorOf(data))
    router.refresh()
  }
  return (
    <div className="space-y-1">
      <Button size="sm" variant="secondary" aria-expanded={open} onClick={() => setOpen((o) => !o)}><ListPlus aria-hidden /> Add to list</Button>
      {open && (
        <div className="rounded-md border border-default bg-surface p-1">
          {lists.length === 0 ? (
            <p className="px-2 py-1.5 text-[12px] text-muted">No lists yet. <a className="text-brand hover:underline" href={`/${orgSlug}/leads/segments`}>Create one</a>.</p>
          ) : lists.map((l) => (
            <button key={l.id} type="button" onClick={() => toggle(l)} disabled={busy === l.id} aria-pressed={l.member}
              className="flex min-h-9 w-full items-center gap-2 rounded px-2 text-left text-[13px] hover:bg-surface-hover disabled:opacity-50">
              <span className="flex size-4 items-center justify-center">{l.member && <Check className="size-4 text-brand" aria-hidden />}</span>
              <span className="truncate">{l.name}</span>
            </button>
          ))}
          {error && <p role="alert" className="px-2 py-1 text-[12px] text-danger">{error}</p>}
        </div>
      )}
    </div>
  )
}
