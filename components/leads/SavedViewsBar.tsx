'use client'
// components/leads/SavedViewsBar.tsx
// Saved views as tabs above the leads list, the List/Board switch, and save / update / rename / share /
// delete. The server decides what each person may change; this only hides buttons it would refuse.
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Columns3, List, MoreHorizontal, Save, Users } from 'lucide-react'
import { Alert, Button, Field, Input } from '@/components/ui'
import { Dialog, DialogClose, DialogContent, DialogFooter } from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils/cn'
import { isEmpty, toLeadSearch, type Layout, type LeadFilters } from '@/lib/leads/view-filters'

export interface ViewTab {
  id: string
  name: string
  layout: Layout
  filters: LeadFilters
  shared: boolean
  mine: boolean
  editable: boolean
  ownerName: string | null
}

type DialogMode = { kind: 'create' } | { kind: 'rename'; view: ViewTab } | { kind: 'delete'; view: ViewTab }

export function SavedViewsBar({ orgSlug, orgId, views, activeId, modified, filters, layout, canShare }: {
  orgSlug: string
  orgId: string
  views: ViewTab[]
  /** The saved view the page was opened from, if any. */
  activeId: string | null
  /** The filters or layout differ from the active view's. */
  modified: boolean
  filters: LeadFilters
  layout: Layout
  canShare: boolean
}) {
  const router = useRouter()
  const [dialog, setDialog] = useState<DialogMode | null>(null)
  const [name, setName] = useState('')
  const [shared, setShared] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const active = views.find((v) => v.id === activeId) ?? null
  const base = `/${orgSlug}/leads`

  function open(mode: DialogMode) {
    setError(null)
    setName(mode.kind === 'create' ? '' : mode.view.name)
    setShared(mode.kind === 'create' ? false : mode.view.shared)
    setDialog(mode)
  }

  async function call(url: string, init: RequestInit): Promise<{ view?: ViewTab } | null> {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(body.error ?? 'Something went wrong. Please try again.'); return null }
      return body
    } catch {
      setError('Network error. Please try again.')
      return null
    } finally {
      setBusy(false)
    }
  }

  async function submit() {
    if (!dialog) return
    if (dialog.kind === 'create') {
      const res = await call('/api/saved-views', { method: 'POST', body: JSON.stringify({ orgId, name, layout, filters, shared }) })
      if (res?.view) { setDialog(null); router.push(`${base}${toLeadSearch(res.view.filters, { layout: res.view.layout, viewId: res.view.id })}`); router.refresh() }
    } else if (dialog.kind === 'rename') {
      const res = await call(`/api/saved-views/${dialog.view.id}`, { method: 'PATCH', body: JSON.stringify({ orgId, name, shared }) })
      if (res) { setDialog(null); router.refresh() }
    } else {
      const res = await call(`/api/saved-views/${dialog.view.id}?orgId=${orgId}`, { method: 'DELETE' })
      if (res) { setDialog(null); router.push(base); router.refresh() }
    }
  }

  async function saveChanges() {
    if (!active) return
    const res = await call(`/api/saved-views/${active.id}`, { method: 'PATCH', body: JSON.stringify({ orgId, filters, layout }) })
    if (res) router.refresh()
  }

  const tab = (href: string, label: React.ReactNode, isActive: boolean, key: string) => (
    <Link
      key={key}
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors',
        isActive ? 'bg-brand-light text-brand' : 'text-muted hover:bg-surface-hover hover:text-foreground'
      )}
    >
      {label}
    </Link>
  )

  const layoutHref = (l: Layout) => `${base}${toLeadSearch(filters, { layout: l, viewId: activeId })}`

  return (
    <div className="mb-3">
    <div className="flex flex-col gap-2 border-b border-default pb-2 md:flex-row md:items-center">
      <nav aria-label="Saved views" className="-mx-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1">
        {tab(base, 'All leads', !activeId && isEmpty(filters), 'all')}
        {views.map((v) =>
          tab(
            `${base}${toLeadSearch(v.filters, { layout: v.layout, viewId: v.id })}`,
            <>
              {v.shared && <Users aria-label="Shared with the team" className="size-3.5" />}
              <span className="max-w-40 truncate">{v.name}</span>
              {v.id === activeId && modified && <span aria-label="changed" className="size-1.5 rounded-full bg-brand" />}
            </>,
            v.id === activeId,
            v.id
          )
        )}
      </nav>

      <div className="flex shrink-0 items-center gap-2">
        {active?.editable && modified && (
          <Button size="sm" variant="secondary" onClick={saveChanges} loading={busy && !dialog}>
            <Save aria-hidden /> Save changes
          </Button>
        )}
        {(!active || modified) && (
          <Button size="sm" variant="ghost" onClick={() => open({ kind: 'create' })}>
            <Save aria-hidden /> {active ? 'Save as new view' : 'Save view'}
          </Button>
        )}
        {active?.editable && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Options for ${active.name}`}>
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => open({ kind: 'rename', view: active })}>
                {canShare ? 'Rename or share…' : 'Rename…'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => open({ kind: 'delete', view: active })}>Delete view</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <div role="group" aria-label="Layout" className="inline-flex rounded-md border border-default p-0.5">
          {(['list', 'board'] as const).map((l) => (
            <Link
              key={l}
              href={layoutHref(l)}
              aria-current={layout === l ? 'true' : undefined}
              className={cn(
                'inline-flex items-center gap-1 rounded px-2 py-1 text-[12px] font-medium transition-colors',
                layout === l ? 'bg-surface-hover text-foreground' : 'text-muted hover:text-foreground'
              )}
            >
              {l === 'list' ? <List aria-hidden className="size-3.5" /> : <Columns3 aria-hidden className="size-3.5" />}
              {l === 'list' ? 'List' : 'Board'}
            </Link>
          ))}
        </div>
      </div>
    </div>
      {error && !dialog && <Alert tone="danger" className="mt-2">{error}</Alert>}

      <Dialog open={dialog !== null} onOpenChange={(o) => { if (!o) setDialog(null) }}>
        {dialog && (
          <DialogContent
            title={dialog.kind === 'create' ? 'Save this view' : dialog.kind === 'rename' ? 'Rename view' : `Delete “${dialog.view.name}”?`}
            description={
              dialog.kind === 'create'
                ? 'Keeps the current filters and layout one click away.'
                : dialog.kind === 'delete'
                  ? dialog.view.shared
                    ? 'It disappears for everyone on the team. The leads themselves are not affected.'
                    : 'The leads themselves are not affected.'
                  : undefined
            }
          >
            <form onSubmit={(e) => { e.preventDefault(); submit() }} className="space-y-4">
              {dialog.kind !== 'delete' && (
                <>
                  <Field label="Name" required>
                    <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus placeholder="e.g. Hot leads this week" />
                  </Field>
                  {canShare && (
                    <label className="flex items-start gap-2 text-[13px] text-foreground">
                      <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} className="mt-0.5 size-4 accent-[var(--brand)]" />
                      <span>
                        Share with the team
                        <span className="block text-[12px] text-muted">Everyone in the workspace sees it as a tab. Sales executives still see only their own leads in it.</span>
                      </span>
                    </label>
                  )}
                </>
              )}
              {error && <Alert tone="danger">{error}</Alert>}
              <DialogFooter>
                <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
                <Button type="submit" variant={dialog.kind === 'delete' ? 'danger' : 'primary'} loading={busy}
                  disabled={dialog.kind !== 'delete' && !name.trim()}>
                  {dialog.kind === 'create' ? 'Save view' : dialog.kind === 'rename' ? 'Save' : 'Delete view'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
