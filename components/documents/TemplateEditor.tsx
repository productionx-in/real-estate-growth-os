'use client'
// components/documents/TemplateEditor.tsx — write a document template with merge fields and see it filled in
// with sample data. The server validates and saves (app/api/documents/templates).
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FilePlus2 } from 'lucide-react'
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui'
import { DocumentBody } from '@/components/documents/DocumentBody'
import { FIELD_GROUPS, SAMPLE_CONTEXT, STARTER_COST_SHEET, renderTemplate, unknownFields } from '@/lib/documents/merge'
import { cn } from '@/lib/utils/cn'

export interface TemplateRow { id: string; name: string; kind: string; body: string }
const KINDS = { cost_sheet: 'Cost sheet', quotation: 'Quotation', letter: 'Letter', other: 'Other' } as const

export function TemplateEditor({ orgId, templates, canEdit }: { orgId: string; templates: TemplateRow[]; canEdit: boolean }) {
  const router = useRouter()
  const [current, setCurrent] = useState<TemplateRow | null>(templates[0] ?? null)
  const [draft, setDraft] = useState<TemplateRow>(templates[0] ?? { id: '', name: 'Cost sheet', kind: 'cost_sheet', body: STARTER_COST_SHEET })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)
  const unknown = unknownFields(draft.body)

  function open(t: TemplateRow | null) {
    setCurrent(t)
    setDraft(t ?? { id: '', name: '', kind: 'cost_sheet', body: STARTER_COST_SHEET })
    setError(null)
    setSaved(false)
  }

  function insert(key: string) {
    const el = area.current
    const token = `{{${key}}}`
    if (!el) { setDraft((d) => ({ ...d, body: d.body + token })); return }
    const start = el.selectionStart ?? draft.body.length
    const end = el.selectionEnd ?? start
    const body = draft.body.slice(0, start) + token + draft.body.slice(end)
    setDraft((d) => ({ ...d, body }))
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length) })
  }

  async function save() {
    setBusy(true); setError(null); setSaved(false)
    try {
      const res = await fetch('/api/documents/templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, id: draft.id || undefined, name: draft.name, kind: draft.kind, body: draft.body }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { setError(out.error ?? 'Could not save.'); return }
      setDraft((d) => ({ ...d, id: out.id }))
      setCurrent({ ...draft, id: out.id })
      setSaved(true)
      router.refresh()
    } catch { setError('Network error. Please try again.') } finally { setBusy(false) }
  }

  async function remove() {
    if (!draft.id || !window.confirm(`Remove “${draft.name}”? Documents already shared keep working.`)) return
    setBusy(true)
    const res = await fetch(`/api/documents/templates/${draft.id}?orgId=${orgId}`, { method: 'DELETE' })
    setBusy(false)
    if (res.ok) { open(null); router.refresh() } else setError('Could not remove the template.')
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[14rem_1fr]">
      <nav aria-label="Templates" className="space-y-1">
        {templates.map((t) => (
          <button key={t.id} type="button" onClick={() => open(t)} aria-current={current?.id === t.id ? 'true' : undefined}
            className={cn('block w-full rounded-md px-3 py-2 text-left text-[13px]', current?.id === t.id ? 'bg-brand-light text-brand' : 'text-foreground hover:bg-surface-hover')}>
            <span className="block truncate font-medium">{t.name}</span>
            <span className="text-[11px] text-muted">{KINDS[t.kind as keyof typeof KINDS] ?? t.kind}</span>
          </button>
        ))}
        {canEdit && (
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => open(null)}>
            <FilePlus2 aria-hidden /> New template
          </Button>
        )}
      </nav>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
            <Field label="Name" required><Input value={draft.name} maxLength={80} disabled={!canEdit} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} /></Field>
            <Field label="Type">
              <Select value={draft.kind} disabled={!canEdit} onChange={(e) => setDraft((d) => ({ ...d, kind: e.target.value }))}>
                {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Template" hint="# Heading, ## Subheading, **bold**, - list items, and | tables |. Fields in {{double braces}} are filled in for each buyer.">
            <Textarea ref={area} rows={18} value={draft.body} readOnly={!canEdit} className="font-mono text-[12px]"
              onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} />
          </Field>
          {canEdit && (
            <details className="rounded-md border border-default p-2">
              <summary className="cursor-pointer text-[13px] font-medium text-foreground">Insert a field</summary>
              <div className="mt-2 space-y-2">
                {FIELD_GROUPS.map((g) => (
                  <div key={g.group}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">{g.group}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {g.fields.map((f) => (
                        <button key={f.key} type="button" onClick={() => insert(f.key)}
                          className="rounded border border-default px-1.5 py-0.5 text-[12px] text-foreground hover:bg-surface-hover">{f.label}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
          {unknown.length > 0 && <Alert tone="warning">Not a field: {unknown.map((k) => `{{${k}}}`).join(', ')}. Use “Insert a field”.</Alert>}
          {error && <Alert tone="danger">{error}</Alert>}
          {saved && <Alert tone="success">Saved.</Alert>}
          {canEdit && (
            <div className="flex gap-2">
              <Button onClick={save} loading={busy} disabled={!draft.name.trim() || !draft.body.trim() || unknown.length > 0}>Save template</Button>
              {draft.id && <Button variant="secondary" onClick={remove} disabled={busy}>Remove</Button>}
            </div>
          )}
        </div>
        <section aria-label="Preview with sample data" className="rounded-lg border border-default bg-surface p-5">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-subtle">Preview with sample data</p>
          <DocumentBody body={renderTemplate(draft.body, SAMPLE_CONTEXT)} />
        </section>
      </div>
    </div>
  )
}
