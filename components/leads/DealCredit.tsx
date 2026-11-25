'use client'
// components/leads/DealCredit.tsx — who gets credit for a booked deal (shared deal credit, 20260098). Everyone who can
// see the lead sees the split, what each person holds from the ledger, and the history. Owners, admins, managers and
// the closer's team leader change it in a side sheet; the closer always keeps the remainder, so it adds up to 100%.
// The server (PUT /api/leads/[leadId]/deal-credit) and the database check every rule again.
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { History, Pencil, Plus, Trash2, UsersRound } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle, Field, Input, Select } from '@/components/ui'
import { Sheet, SheetContent, SheetFooter } from '@/components/ui/sheet'
import { toast } from '@/components/ui/toast'
import { MAX_SHARERS, SPLIT_PRESETS, closerRemainder, fmtDeals, normaliseShares, type Share } from '@/lib/sales/deal-credit'

interface View {
  closer: { id: string; name: string } | null
  shares: (Share & { name: string })[]
  holdings: { profileId: string; name: string; credit: number; revenue: number; xp: number }[]
  history: { id: number; at: string; by: string; before: Share[]; after: Share[]; reason: string | null }[]
  people: { id: string; name: string }[]
  booked: boolean
  canManage: boolean
}

const inr = (n: number) => (n >= 1e7 ? `₹${+(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${+(n / 1e5).toFixed(1)} L` : `₹${Math.round(n).toLocaleString('en-IN')}`)
const when = (iso: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))

export function DealCredit({ leadId }: { leadId: string }) {
  const router = useRouter()
  const [view, setView] = useState<View | null>(null)
  const [failed, setFailed] = useState(false)
  const [editing, setEditing] = useState(false)
  const [showHistory, setShowHistory] = useState(false)

  const [version, setVersion] = useState(0)
  useEffect(() => {
    let live = true
    fetch(`/api/leads/${leadId}/deal-credit`)
      .then(async (res) => { if (!live) return; if (!res.ok) { setFailed(true); return } setView(await res.json()); setFailed(false) })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [leadId, version])

  if (failed || !view?.booked || !view.closer) return null
  const closerPct = closerRemainder(view.shares)
  const names = new Map(view.people.map((p) => [p.id, p.name]))
  const label = (s: Share[]) => s.length ? s.map((x) => `${names.get(x.profileId) ?? 'Former member'} ${x.sharePct}%`).join(', ') : 'closer only'

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2"><UsersRound className="size-4 text-brand" aria-hidden /> Deal credit</CardTitle>
          <p className="mt-0.5 text-[12px] text-muted">{view.shares.length ? 'Shared. Targets, points and leaderboards count each person’s share; the deal itself counts once.' : 'All of it goes to the closer.'}</p>
        </div>
        {view.canManage && <Button size="sm" variant="secondary" onClick={() => setEditing(true)}><Pencil aria-hidden /> {view.shares.length ? 'Change' : 'Share'}</Button>}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-hover" role="img" aria-label={`${view.closer.name} ${closerPct}%${view.shares.map((s) => `, ${s.name} ${s.sharePct}%`).join('')}`}>
          <div className="h-full bg-brand" style={{ width: `${closerPct}%` }} />
          {view.shares.map((s, i) => <div key={s.profileId} className={i % 2 ? 'h-full bg-success' : 'h-full bg-warning'} style={{ width: `${s.sharePct}%` }} />)}
        </div>
        <ul className="divide-y divide-[var(--border)] text-[13px]">
          {[{ profileId: view.closer.id, name: view.closer.name, sharePct: closerPct, closer: true }, ...view.shares.map((s) => ({ ...s, closer: false }))].map((s) => {
            const h = view.holdings.find((x) => x.profileId === s.profileId)
            return (
              <li key={s.profileId} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0"><span className="font-medium text-foreground">{s.name}</span>{s.closer && <span className="ml-1.5 text-[11px] text-muted">closer</span>}</span>
                <span className="shrink-0 text-right tabular-nums">
                  <span className="font-semibold text-foreground">{s.sharePct}%</span>
                  {h && <span className="block text-[11px] text-muted">{fmtDeals(h.credit)} deal{h.revenue ? ` · ${inr(h.revenue)}` : ''} · {h.xp} XP</span>}
                </span>
              </li>
            )
          })}
        </ul>
        {view.history.length > 0 && (
          <div>
            <button type="button" className="inline-flex items-center gap-1 text-[12px] font-medium text-muted hover:text-foreground" aria-expanded={showHistory} onClick={() => setShowHistory((v) => !v)}>
              <History className="size-3.5" aria-hidden /> {showHistory ? 'Hide' : 'Show'} changes ({view.history.length})
            </button>
            {showHistory && (
              <ol className="mt-2 space-y-2 text-[12px] text-muted">
                {view.history.map((h) => (
                  <li key={h.id} className="well rounded-lg px-3 py-2">
                    <span className="font-medium text-foreground">{h.by}</span> · {when(h.at)}<br />
                    {label(h.before)} → {label(h.after)}{h.reason ? <><br />“{h.reason}”</> : null}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </CardContent>
      {editing && <SplitSheet leadId={leadId} view={view} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); setVersion((v) => v + 1); router.refresh() }} />}
    </Card>
  )
}

function SplitSheet({ leadId, view, onClose, onSaved }: { leadId: string; view: View; onClose: () => void; onSaved: () => void }) {
  const closerId = view.closer!.id
  const [rows, setRows] = useState<{ profileId: string; pct: string }[]>(view.shares.map((s) => ({ profileId: s.profileId, pct: String(s.sharePct) })))
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const choices = view.people.filter((p) => p.id !== closerId)
  const parsed = useMemo(() => normaliseShares(rows.filter((r) => r.profileId || r.pct).map((r) => ({ profileId: r.profileId, sharePct: Number(r.pct) })), closerId), [rows, closerId])
  const remainder = parsed.error ? null : closerRemainder(parsed.value)
  const unchanged = JSON.stringify([...parsed.value].sort((a, b) => a.profileId.localeCompare(b.profileId))) ===
    JSON.stringify(view.shares.map((s) => ({ profileId: s.profileId, sharePct: s.sharePct })).sort((a, b) => a.profileId.localeCompare(b.profileId)))

  const preset = (closer: number) => {
    const first = rows[0]?.profileId || choices[0]?.id || ''
    setRows([{ profileId: first, pct: String(100 - closer) }])
  }
  const set = (i: number, patch: Partial<{ profileId: string; pct: string }>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  async function save() {
    if (parsed.error) { toast.error(parsed.error); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/leads/${leadId}/deal-credit`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shares: parsed.value, reason: reason.trim() || undefined }) })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(out.error ?? 'Could not save the split.'); return }
      toast.success(parsed.value.length ? 'Credit shared. Everyone’s numbers are updated.' : 'All credit is back with the closer.')
      onSaved()
    } catch { toast.error('Network error. Please try again.') } finally { setBusy(false) }
  }

  return (
    <Sheet open onOpenChange={(o) => { if (!o && !busy) onClose() }}>
      <SheetContent title="Share deal credit" description={`${view.closer!.name} closed this deal and keeps whatever is not shared. The total is always 100%.`}>
        <div className="space-y-5">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick splits">
            {SPLIT_PRESETS.map((p) => <Button key={p.label} size="sm" variant="secondary" onClick={() => preset(p.closer)} disabled={!choices.length}>{p.label}</Button>)}
            <Button size="sm" variant="ghost" onClick={() => setRows([])}>Closer only</Button>
          </div>
          <div className="space-y-2">
            {rows.length > 0 && <div className="flex gap-2 text-[12px] font-medium text-foreground" aria-hidden><span className="flex-1">Person</span><span className="w-24">Share %</span><span className="w-9" /></div>}
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select className="min-w-0 flex-1" value={r.profileId} onChange={(e) => set(i, { profileId: e.target.value })} aria-label={`Person ${i + 1}`}>
                  <option value="">Choose…</option>
                  {choices.map((p) => <option key={p.id} value={p.id} disabled={rows.some((x, j) => j !== i && x.profileId === p.id)}>{p.name}</option>)}
                </Select>
                <Input className="w-24" inputMode="decimal" value={r.pct} onChange={(e) => set(i, { pct: e.target.value.replace(/[^0-9.]/g, '') })} aria-label={`Share for person ${i + 1}, percent`} />
                <Button size="icon" variant="ghost" aria-label={`Remove person ${i + 1}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 aria-hidden /></Button>
              </div>
            ))}
            {rows.length < MAX_SHARERS && (
              <Button size="sm" variant="ghost" onClick={() => setRows([...rows, { profileId: '', pct: '' }])} disabled={!choices.length}><Plus aria-hidden /> Add a person</Button>
            )}
          </div>
          <div className="well rounded-xl px-4 py-3 text-[13px]" aria-live="polite">
            {remainder === null
              ? <span className="text-danger">{parsed.error}</span>
              : <><span className="font-semibold text-foreground">{view.closer!.name} keeps {remainder}%</span><span className="block text-[12px] text-muted">The deal still counts once, for the closer. Credit, revenue and points are split in these proportions.</span></>}
          </div>
          <Field label="Why" hint="Optional — kept with the change history.">
            <Input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Priya ran the site visit" />
          </Field>
          <SheetFooter>
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={save} loading={busy} disabled={busy || remainder === null || unchanged}>Save split</Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  )
}
