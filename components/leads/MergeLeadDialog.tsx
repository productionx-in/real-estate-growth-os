'use client'
// components/leads/MergeLeadDialog.tsx — managers merge a duplicate into the lead they are looking at. The
// duplicate's calls, notes, follow-ups, visits, deals and chats move here; it stays as a link (nothing is
// deleted), and the merge is recorded in the timeline and the audit log. The server checks every step.
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { GitMerge, Search } from 'lucide-react'
import { Alert, Button, Input } from '@/components/ui'
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog'

interface Candidate { id: string; name: string; phone: string | null; status: string }

export function MergeLeadDialog({ orgId, leadId, leadName, suggested }: { orgId: string; leadId: string; leadName: string; suggested?: Candidate | null }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [q, setQ] = React.useState('')
  const [results, setResults] = React.useState<Candidate[]>([])
  const [picked, setPicked] = React.useState<Candidate | null>(suggested ?? null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const term = q.trim()
    if (term.length < 2) return
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?orgId=${orgId}&q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        const json = await res.json()
        setResults((json.leads ?? []).filter((l: Candidate) => l.id !== leadId))
      } catch { /* aborted */ }
    }, 200)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [q, orgId, leadId])

  async function merge() {
    if (!picked) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/leads/${leadId}/merge`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceLeadId: picked.id }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error || 'Could not merge the leads.'); return }
      setOpen(false)
      router.refresh()
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setError(null); setQ(''); setResults([]) } }}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm"><GitMerge aria-hidden /> Merge duplicate</Button>
      </DialogTrigger>
      <DialogContent title={`Merge a duplicate into ${leadName}`} description="Its history moves here. The duplicate is kept as a link to this lead and closed; nothing is deleted.">
        <div className="space-y-3">
          {suggested && (
            <p className="text-[12px] text-muted">RE flagged a likely duplicate; it is selected below. You can search for another.</p>
          )}
          <label className="relative block">
            <span className="sr-only">Find the duplicate</span>
            <Search aria-hidden className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone or email…"
              className="pl-9 pr-3" />
          </label>
          <ul className="max-h-56 space-y-1 overflow-y-auto" aria-label="Leads">
            {[...(suggested && !results.some((r) => r.id === suggested.id) ? [suggested] : []), ...results].map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setPicked(c)} aria-pressed={picked?.id === c.id}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-[13px] ${picked?.id === c.id ? 'border-brand bg-brand-light' : 'border-default hover:bg-surface-hover'}`}>
                  <span className="font-medium">{c.name}</span> <span className="text-muted">{c.phone ?? ''}</span>
                </button>
              </li>
            ))}
          </ul>
          {picked && <Alert tone="warning">Merging <strong>{picked.name}</strong> into <strong>{leadName}</strong>. This cannot be undone from the app.</Alert>}
          {error && <Alert tone="danger">{error}</Alert>}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={merge} disabled={!picked || busy}>{busy ? 'Merging…' : 'Merge'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** On a lead RE flagged as a duplicate: merge it into its original in one step (with a confirmation). */
export function MergeIntoOriginalButton({ leadId, originalId, originalHref }: { leadId: string; originalId: string; originalHref: string }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  async function merge() {
    if (!window.confirm('Merge this duplicate into the original lead? Its history moves there; this record is kept as a link and closed.')) return
    setBusy(true); setError(null)
    const res = await fetch(`/api/leads/${originalId}/merge`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceLeadId: leadId }) })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setError(json.error || 'Could not merge the leads.'); return }
    router.push(originalHref)
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button size="sm" variant="secondary" onClick={merge} disabled={busy}><GitMerge aria-hidden /> {busy ? 'Merging…' : 'Merge into the original'}</Button>
      {error && <span role="alert" className="text-[12px] text-danger">{error}</span>}
    </span>
  )
}
