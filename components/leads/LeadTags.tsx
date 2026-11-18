'use client'
// components/leads/LeadTags.tsx — a lead's tags: shown to everyone who can see the lead, editable by whoever
// works it. Suggestions are tags already used in this workspace, so the team converges on the same words.
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Tag, X, Plus } from 'lucide-react'
import { MAX_TAGS, normalizeTag } from '@/lib/leads/tags'

export function LeadTags({ leadId, tags, suggestions, canEdit }: { leadId: string; tags: string[]; suggestions: string[]; canEdit: boolean }) {
  const router = useRouter()
  const [value, setValue] = React.useState(tags)
  const [draft, setDraft] = React.useState('')
  const [adding, setAdding] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const listId = React.useId()

  async function save(next: string[]) {
    const prev = value
    setValue(next); setError(null)
    const res = await fetch(`/api/leads/${leadId}/tags`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tags: next }) })
    if (!res.ok) { setValue(prev); setError('Could not save the tags.'); return }
    router.refresh()
  }
  function add() {
    const t = normalizeTag(draft)
    setDraft('')
    if (!t || value.includes(t) || value.length >= MAX_TAGS) return
    void save([...value, t])
  }

  if (!canEdit && value.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Tag aria-hidden className="size-3.5 text-subtle" />
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-full border border-default bg-surface-muted px-2 py-0.5 text-[12px] text-foreground">
          {t}
          {canEdit && (
            <button type="button" onClick={() => save(value.filter((x) => x !== t))} aria-label={`Remove tag ${t}`} className="rounded-full text-subtle hover:text-danger">
              <X aria-hidden className="size-3" />
            </button>
          )}
        </span>
      ))}
      {canEdit && value.length < MAX_TAGS && (adding ? (
        <form onSubmit={(e) => { e.preventDefault(); add(); }} className="inline-flex">
          <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => { if (draft.trim()) add(); setAdding(false) }}
            list={listId} maxLength={30} placeholder="tag" aria-label="New tag"
            className="h-7 w-28 rounded-full border border-strong bg-surface px-2.5 text-[12px] outline-none focus:border-ring" />
          <datalist id={listId}>{suggestions.filter((s) => !value.includes(s)).slice(0, 30).map((s) => <option key={s} value={s} />)}</datalist>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-strong px-2 py-0.5 text-[12px] text-muted hover:text-foreground">
          <Plus aria-hidden className="size-3" /> {value.length ? 'Tag' : 'Add tag'}
        </button>
      ))}
      {error && <span role="alert" className="text-[12px] text-danger">{error}</span>}
    </div>
  )
}
