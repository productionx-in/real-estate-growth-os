'use client'
// components/layout/CommandPalette.tsx
// ⌘K / Ctrl+K: jump to any page, start common actions, or find a lead or project by name, phone or email.
// Pages and actions come from lib/navigation/nav.ts; leads and projects from /api/search, which applies the
// same visibility rule as the Leads page (a sales executive only finds their own leads).
import * as React from 'react'
import { useRouter } from 'next/navigation'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Search, Plus, Upload, FolderOpen, User, CornerDownLeft, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { NAV_ICONS } from '@/components/layout/Sidebar'
import { navGroups, canCreateLead, type OrgType } from '@/lib/navigation/nav'
import { STATUS_LABELS } from '@/lib/leads/transitions'
import type { MemberRole, LeadStatus } from '@/types/database'
import { isManagement } from '@/lib/auth/permissions'

/** Fired by the header's search button. */
export const PALETTE_OPEN_EVENT = 'regrow:open-palette'

interface Option {
  id: string
  group: string
  label: string
  hint?: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

interface Results {
  leads: { id: string; name: string; phone: string | null; status: string; projectName: string | null }[]
  projects: { id: string; name: string; city: string | null }[]
}

export function CommandPalette({ orgId, orgSlug, role, orgType, disabledModules }: {
  orgId: string; orgSlug: string; role: MemberRole; orgType: OrgType; disabledModules: string[]
}) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<Results | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [active, setActive] = React.useState(0)
  const listRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((v) => !v) }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener(PALETTE_OPEN_EVENT, onOpen)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener(PALETTE_OPEN_EVENT, onOpen) }
  }, [])

  // Search as you type (debounced; earlier requests are cancelled).
  const term = query.trim()
  const searching = term.length >= 2
  React.useEffect(() => {
    if (!searching) return
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/search?orgId=${encodeURIComponent(orgId)}&q=${encodeURIComponent(term)}`, { signal: ctrl.signal, cache: 'no-store' })
        setResults(res.ok ? await res.json() : { leads: [], projects: [] })
        setActive(0)
      } catch { /* aborted or offline: keep the last results */ }
      finally { if (!ctrl.signal.aborted) setLoading(false) }
    }, 180)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [term, searching, orgId])
  const shown = searching ? results : null
  const busy = searching && loading

  const options = React.useMemo<Option[]>(() => {
    const pages: Option[] = navGroups(orgSlug, role, orgType, disabledModules).flatMap((g) => g.items).map((i) => ({
      id: `page-${i.key}`, group: 'Go to', label: i.label, href: i.href, icon: NAV_ICONS[i.key],
    }))
    const actions: Option[] = canCreateLead(role) ? [
      { id: 'new-lead', group: 'Actions', label: 'Add a lead', href: `/${orgSlug}/leads/new`, icon: Plus },
      ...(isManagement(role) ? [{ id: 'import', group: 'Actions', label: 'Import leads', href: `/${orgSlug}/leads/import`, icon: Upload }] : []),
    ] : []
    const t = term.toLowerCase()
    const match = (o: Option) => !t || o.label.toLowerCase().includes(t)
    const found: Option[] = shown ? [
      ...shown.leads.map((l) => ({
        id: `lead-${l.id}`, group: 'Leads', label: l.name, icon: User, href: `/${orgSlug}/leads/${l.id}`,
        hint: [l.phone, STATUS_LABELS[l.status as LeadStatus] ?? l.status, l.projectName].filter(Boolean).join(' · '),
      })),
      ...shown.projects.map((p) => ({ id: `project-${p.id}`, group: 'Projects', label: p.name, hint: p.city ?? undefined, icon: FolderOpen, href: `/${orgSlug}/projects/${p.id}` })),
    ] : []
    return [...found, ...actions.filter(match), ...pages.filter(match)]
  }, [orgSlug, role, orgType, disabledModules, shown, term])

  React.useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function go(o: Option | undefined) {
    if (!o) return
    setOpen(false)
    router.push(o.href)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, options.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); go(options[active]) }
  }

  function onOpenChange(v: boolean) {
    setOpen(v)
    if (!v) { setQuery(''); setResults(null) }
  }

  const activeId = options[active] ? `cmd-${options[active].id}` : undefined
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-x-3 top-3 z-50 mx-auto flex max-h-[min(560px,calc(100dvh-1.5rem))] max-w-xl flex-col overflow-hidden rounded-xl border border-default bg-surface shadow-xl sm:top-[12vh]"
        >
          <DialogPrimitive.Title className="sr-only">Search and go</DialogPrimitive.Title>
          <div className="flex items-center gap-2.5 border-b border-default px-4">
            {busy ? <Loader2 aria-hidden className="size-4 animate-spin text-subtle" /> : <Search aria-hidden className="size-4 text-subtle" />}
            <input
              autoFocus
              data-palette-input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActive(0) }}
              onKeyDown={onKeyDown}
              placeholder="Search leads, projects or pages…"
              role="combobox"
              aria-expanded
              aria-controls="cmd-list"
              aria-activedescendant={activeId}
              aria-autocomplete="list"
              aria-label="Search leads, projects or pages"
              className="h-14 flex-1 bg-transparent text-[16px] text-foreground placeholder:text-subtle sm:text-[14px]"
            />
            <kbd className="hidden rounded border border-default px-1.5 py-0.5 text-[11px] text-subtle sm:block">Esc</kbd>
          </div>
          <div ref={listRef} id="cmd-list" role="listbox" aria-label="Results" className="flex-1 overflow-y-auto p-2">
            {options.length === 0 && (
              <p className="px-3 py-8 text-center text-[13px] text-muted">
                {busy ? 'Searching…' : `Nothing matches “${term}”. Try a name, a phone number or an email.`}
              </p>
            )}
            {options.map((o, i) => {
              const Icon = o.icon
              const heading = i === 0 || options[i - 1].group !== o.group ? o.group : null
              return (
                <React.Fragment key={o.id}>
                  {heading && <div role="presentation" className="px-3 pb-1 pt-3 text-[11px] font-medium text-subtle first:pt-1">{heading}</div>}
                  <div
                    id={`cmd-${o.id}`}
                    role="option"
                    aria-selected={i === active}
                    data-index={i}
                    onMouseMove={() => setActive(i)}
                    onClick={() => go(o)}
                    className={cn('flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-[13px]', i === active ? 'bg-surface-hover' : '')}
                  >
                    <Icon className="size-4 flex-shrink-0 text-subtle" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">{o.label}</span>
                      {o.hint && <span className="tabular block truncate text-[12px] text-muted">{o.hint}</span>}
                    </span>
                    {i === active && <CornerDownLeft aria-hidden className="size-3.5 flex-shrink-0 text-subtle" />}
                  </div>
                </React.Fragment>
              )
            })}
          </div>
          <div className="hidden items-center gap-4 border-t border-default px-4 py-2 text-[11px] text-subtle sm:flex">
            <span><kbd className="font-sans">↑↓</kbd> to move</span>
            <span><kbd className="font-sans">↵</kbd> to open</span>
            <span className="ml-auto">Leads you can see, in this workspace</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
