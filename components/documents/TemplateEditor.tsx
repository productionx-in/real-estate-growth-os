'use client'
// components/documents/TemplateEditor.tsx — the workspace's document templates. Start from a built-in template
// (lib/documents/library.ts) or write one with merge fields, and see it filled in with sample buyer data under the
// company's own letterhead. The server validates and saves (app/api/documents/templates).
import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FilePlus2, LayoutTemplate } from 'lucide-react'
import { Alert, Badge, Button, Field, Input, Select, Textarea } from '@/components/ui'
import { DocumentBody } from '@/components/documents/DocumentBody'
import { FIELD_GROUPS, SAMPLE_CONTEXT, renderTemplate, unknownFields, type MergeContext } from '@/lib/documents/merge'
import { TEMPLATE_KINDS } from '@/lib/documents/kinds'
import { buildLetterhead, type BusinessProfile } from '@/lib/documents/letterhead'
import { libraryFor, type LibraryTemplate } from '@/lib/documents/library'
import { cn } from '@/lib/utils/cn'

export interface TemplateRow { id: string; name: string; kind: string; body: string; letterhead: boolean }

export function TemplateEditor({ orgId, orgName, orgType, profile, missing, settingsHref, templates, canEdit }: {
  orgId: string
  orgName: string
  orgType: 'developer' | 'channel_partner'
  /** The workspace's business details: the preview shows its real letterhead. */
  profile: BusinessProfile
  /** What the letterhead still lacks (empty = complete). */
  missing: string[]
  settingsHref: string | null
  templates: TemplateRow[]
  canEdit: boolean
}) {
  const router = useRouter()
  const library = libraryFor(orgType)
  const [current, setCurrent] = useState<TemplateRow | null>(templates[0] ?? null)
  const [draft, setDraft] = useState<TemplateRow | null>(templates[0] ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const area = useRef<HTMLTextAreaElement>(null)
  // Sample buyer and unit, but the workspace's own company details, so the preview looks like the real thing.
  const hasProfile = !!(profile.legalName || profile.address || profile.phone)
  const context: MergeContext = hasProfile ? { ...SAMPLE_CONTEXT, org: { name: orgName, profile } } : SAMPLE_CONTEXT
  const letterhead = buildLetterhead(context.org.name, context.org.profile!)

  function open(t: TemplateRow | null) {
    setCurrent(t); setDraft(t); setError(null); setSaved(false)
  }
  function startFrom(l: LibraryTemplate | null) {
    const taken = new Set(templates.map((t) => t.name.toLowerCase()))
    let name = l?.name ?? ''
    for (let n = 2; name && taken.has(name.toLowerCase()); n++) name = `${l!.name} ${n}`
    setCurrent(null)
    setDraft({ id: '', name, kind: l?.kind ?? 'letter', body: l?.body ?? '# Title\n\nDear {{lead.name}},\n\n', letterhead: true })
    setError(null); setSaved(false)
  }

  function insert(key: string) {
    if (!draft) return
    const el = area.current
    const token = `{{${key}}}`
    if (!el) { setDraft({ ...draft, body: draft.body + token }); return }
    const start = el.selectionStart ?? draft.body.length
    const end = el.selectionEnd ?? start
    setDraft({ ...draft, body: draft.body.slice(0, start) + token + draft.body.slice(end) })
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + token.length, start + token.length) })
  }

  async function save() {
    if (!draft) return
    setBusy(true); setError(null); setSaved(false)
    try {
      const res = await fetch('/api/documents/templates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, id: draft.id || undefined, name: draft.name, kind: draft.kind, body: draft.body, letterhead: draft.letterhead }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { setError(out.error ?? 'Could not save.'); return }
      const row = { ...draft, id: out.id }
      setDraft(row); setCurrent(row); setSaved(true)
      router.refresh()
    } catch { setError('Network error. Please try again.') } finally { setBusy(false) }
  }

  async function remove() {
    if (!draft?.id || !window.confirm(`Remove “${draft.name}”? Documents already shared keep working.`)) return
    setBusy(true)
    const res = await fetch(`/api/documents/templates/${draft.id}?orgId=${orgId}`, { method: 'DELETE' })
    setBusy(false)
    if (res.ok) { open(null); router.refresh() } else setError('Could not remove the template.')
  }

  const unknown = draft ? unknownFields(draft.body) : []

  return (
    <div className="space-y-4">
      {canEdit && missing.length > 0 && (
        <Alert tone="info" title="Put your company on every document">
          Your letterhead is missing: {missing.join(', ')}.{' '}
          {settingsHref ? <Link href={settingsHref} className="font-medium underline">Add business details</Link> : 'An owner or admin can add them in Settings.'}
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[15rem_1fr]">
        <nav aria-label="Your templates" className="space-y-1">
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">Your templates</p>
          {templates.length === 0 && <p className="px-3 text-[12px] text-muted">None yet — start from one of ours.</p>}
          {templates.map((t) => (
            <button key={t.id} type="button" onClick={() => open(t)} aria-current={current?.id === t.id ? 'true' : undefined}
              className={cn('block w-full rounded-md px-3 py-2 text-left text-[13px]', current?.id === t.id ? 'bg-brand-light text-brand' : 'text-foreground hover:bg-surface-hover')}>
              <span className="block truncate font-medium">{t.name}</span>
              <span className="text-[11px] text-muted">{TEMPLATE_KINDS[t.kind as keyof typeof TEMPLATE_KINDS] ?? t.kind}</span>
            </button>
          ))}
          {canEdit && (
            <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => setDraft(null)}>
              <FilePlus2 aria-hidden /> New template
            </Button>
          )}
        </nav>

        {!draft ? (
          <section aria-labelledby="library-title" className="space-y-3">
            <div>
              <h2 id="library-title" className="flex items-center gap-2 text-[14px] font-semibold text-foreground"><LayoutTemplate aria-hidden className="size-4 text-brand" /> Start from a template</h2>
              <p className="text-[12px] text-muted">Ready-made documents with your letterhead. Pick one, adjust the wording, save.</p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {library.map((l) => (
                <li key={l.key}>
                  <button type="button" disabled={!canEdit} onClick={() => startFrom(l)}
                    className="flex h-full w-full flex-col gap-1.5 rounded-lg border border-default bg-surface p-4 text-left transition-colors hover:border-brand hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60">
                    <span className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-foreground">{l.name}</span>
                      {l.audience === 'channel_partner' && <Badge>Agency</Badge>}
                    </span>
                    <span className="text-[12px] text-muted">{l.summary}</span>
                    <span className="mt-auto pt-1 text-[11px] text-subtle">{TEMPLATE_KINDS[l.kind]}</span>
                  </button>
                </li>
              ))}
              {canEdit && (
                <li>
                  <button type="button" onClick={() => startFrom(null)}
                    className="flex h-full w-full flex-col items-start gap-1.5 rounded-lg border border-dashed border-strong p-4 text-left hover:bg-surface-hover">
                    <span className="text-[13px] font-semibold text-foreground">Blank template</span>
                    <span className="text-[12px] text-muted">Write your own with merge fields.</span>
                  </button>
                </li>
              )}
            </ul>
            {!canEdit && <p className="text-[12px] text-muted">Managers and above can add templates.</p>}
          </section>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
                <Field label="Name" required><Input value={draft.name} maxLength={80} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
                <Field label="Type">
                  <Select value={draft.kind} disabled={!canEdit} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
                    {Object.entries(TEMPLATE_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </Field>
              </div>
              <label className="flex items-center gap-2 text-[13px] text-foreground">
                <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={draft.letterhead} disabled={!canEdit}
                  onChange={(e) => setDraft({ ...draft, letterhead: e.target.checked })} />
                Print on our letterhead (company name, address, GSTIN, RERA)
              </label>
              <Field label="Template" hint="# Heading, ## Subheading, **bold**, - list items, | tables |. Fields in {{double braces}} are filled in for each buyer; ________ marks a blank to fill in before sharing.">
                <Textarea ref={area} rows={18} value={draft.body} readOnly={!canEdit} className="font-mono text-[12px]"
                  onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
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
                              className="min-h-8 rounded border border-default px-2 py-0.5 text-[12px] text-foreground hover:bg-surface-hover">{f.label}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              {unknown.length > 0 && <Alert tone="warning">Not a field: {unknown.map((k) => `{{${k}}}`).join(', ')}. Use “Insert a field”.</Alert>}
              {error && <Alert tone="danger">{error}</Alert>}
              {saved && <Alert tone="success">Saved. It’s now available on every lead’s Documents panel.</Alert>}
              {canEdit && (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={save} loading={busy} disabled={!draft.name.trim() || !draft.body.trim() || unknown.length > 0}>Save template</Button>
                  {draft.id ? <Button variant="secondary" onClick={remove} disabled={busy}>Remove</Button>
                    : <Button variant="ghost" onClick={() => open(templates[0] ?? null)} disabled={busy}>Cancel</Button>}
                </div>
              )}
            </div>
            <section aria-label="Preview with sample data" className="rounded-lg border border-default bg-surface p-5 shadow-2xs">
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-wide text-subtle">
                Preview · sample buyer{hasProfile ? ', your company details' : ' and company'}
              </p>
              <DocumentBody body={renderTemplate(draft.body, context)} letterhead={draft.letterhead ? letterhead : null} />
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
