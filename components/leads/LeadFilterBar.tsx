'use client'
// components/leads/LeadFilterBar.tsx
// Filters for the leads list and board. Every change is written to the URL, so a filtered list can be
// bookmarked, shared or saved as a view. The server re-validates and applies them (lib/leads/view-filters).
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Search, X } from 'lucide-react'
import { Button, Input, Select } from '@/components/ui'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils/cn'
import { STATUS_LABELS, STATUS_ORDER } from '@/lib/leads/transitions'
import {
  CREATED, FOCI, PRIORITIES, SOURCES, SOURCE_LABELS, isEmpty, toLeadSearch,
  type Layout, type LeadFilters,
} from '@/lib/leads/view-filters'

export interface FilterOption { id: string; label: string }

function MultiFilter<T extends string>({ label, options, labels, value, onChange }: {
  label: string
  options: readonly T[]
  labels: Record<T, string>
  value: T[] | undefined
  onChange: (next: T[] | undefined) => void
}) {
  // Ticks collect while the menu is open and apply once when it closes (one page load, no lost ticks).
  const [draft, setDraft] = useState<T[] | null>(null)
  const chosen = draft ?? value ?? []
  const summary = chosen.length === 0 ? label : chosen.length === 1 ? labels[chosen[0]] : `${label} · ${chosen.length}`
  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) { setDraft(value ?? []); return }
        if (draft && draft.join() !== (value ?? []).join()) onChange(draft.length ? options.filter((o) => draft.includes(o)) : undefined)
        setDraft(null)
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="secondary" className={cn(chosen.length > 0 && 'border-brand text-brand')}>
          {summary}
          <ChevronDown aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o}
            checked={chosen.includes(o)}
            onCheckedChange={(on) => setDraft((d) => {
              const cur = d ?? value ?? []
              return on ? [...cur, o] : cur.filter((c) => c !== o)
            })}
          >
            {labels[o]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const PRIORITY_LABELS = { high: 'High', medium: 'Medium', low: 'Low' } as const

export function LeadFilterBar({ orgSlug, filters, layout, viewId, projects, members, canFilterAssignee }: {
  orgSlug: string
  filters: LeadFilters
  layout: Layout
  viewId: string | null
  projects: FilterOption[]
  members: FilterOption[]
  /** Sales executives only ever see their own leads, so they get no "assigned to" filter. */
  canFilterAssignee: boolean
}) {
  const router = useRouter()
  const [q, setQ] = useState(filters.q ?? '')
  // When the URL's search changes (back button, a saved view), show it in the box.
  const [urlQ, setUrlQ] = useState(filters.q)
  if (urlQ !== filters.q) { setUrlQ(filters.q); setQ(filters.q ?? '') }

  function apply(patch: Partial<LeadFilters>) {
    const next: LeadFilters = { ...filters, ...patch }
    for (const k of Object.keys(patch) as (keyof LeadFilters)[]) if (patch[k] === undefined) delete next[k]
    router.push(`/${orgSlug}/leads${toLeadSearch(next, { layout, viewId })}`)
  }

  // Search as you type, after a short pause.
  useEffect(() => {
    const trimmed = q.trim()
    if (trimmed === (filters.q ?? '')) return
    if (trimmed.length === 1) return
    const t = setTimeout(() => apply({ q: trimmed || undefined }), 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply reads the latest filters on each render
  }, [q])

  const select = (value: string | undefined, onChange: (v: string | undefined) => void, label: string, options: FilterOption[]) => (
    <Select
      aria-label={label}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value || undefined)}
      className={cn('h-8 w-auto max-w-48 text-[12px]', value && 'border-brand text-brand')}
    >
      <option value="">{label}</option>
      {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
    </Select>
  )

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="relative w-full sm:w-56">
        <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
        <Input
          type="search"
          aria-label="Search leads by name, phone or email"
          placeholder="Name, phone or email"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') apply({ q: q.trim() || undefined }) }}
          className="h-8 pl-8 text-[12px]"
        />
      </div>

      <MultiFilter label="Status" options={STATUS_ORDER} labels={STATUS_LABELS} value={filters.status} onChange={(v) => apply({ status: v })} />
      <MultiFilter label="Source" options={SOURCES} labels={SOURCE_LABELS} value={filters.source} onChange={(v) => apply({ source: v })} />
      <MultiFilter label="Priority" options={PRIORITIES} labels={PRIORITY_LABELS} value={filters.priority} onChange={(v) => apply({ priority: v })} />
      {projects.length > 0 && select(filters.project, (v) => apply({ project: v }), 'Any project', projects)}
      {canFilterAssignee && select(filters.assignee, (v) => apply({ assignee: v }), 'Anyone', [
        { id: 'me', label: 'Assigned to me' }, { id: 'none', label: 'Unassigned' }, ...members,
      ])}
      {select(filters.created, (v) => apply({ created: v as LeadFilters['created'] }), 'Any time',
        Object.entries(CREATED).map(([id, label]) => ({ id, label: `Added: ${label.toLowerCase()}` })))}
      {select(filters.focus, (v) => apply({ focus: v as LeadFilters['focus'] }), 'Needs attention…',
        Object.entries(FOCI).map(([id, label]) => ({ id, label })))}

      {!isEmpty(filters) && (
        <Button size="sm" variant="ghost" onClick={() => router.push(`/${orgSlug}/leads${toLeadSearch({}, { layout, viewId })}`)}>
          <X aria-hidden /> Clear filters
        </Button>
      )}
    </div>
  )
}
