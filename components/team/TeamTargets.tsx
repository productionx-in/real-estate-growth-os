'use client'
// components/team/TeamTargets.tsx — this month's targets for each salesperson and how far along they are: site
// visits completed, bookings and booking value (bookings count for whoever owns the lead). Owners, admins and
// managers see and set them (the team page and app/api/team/targets check that).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Target } from 'lucide-react'
import { Alert, Button, Input } from '@/components/ui'
import { cn } from '@/lib/utils/cn'
import { expectedByNow, percent, type Progress, type Targets } from '@/lib/team/targets'

interface Person { profileId: string; name: string; targets: Targets; progress: Progress }

const inr = (n: number) => (n >= 1e7 ? `₹${+(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${+(n / 1e5).toFixed(1)} L` : `₹${n.toLocaleString('en-IN')}`)

function Bar({ done, target, expected, label }: { done: number; target: number | null; expected: number; label: string }) {
  const pct = percent(done, target)
  if (pct === null) return <span className="text-[12px] text-subtle">{label === 'value' ? inr(done) : done} · no target</span>
  const behind = pct + 10 < expected
  return (
    <div className="min-w-28">
      <div className="flex justify-between text-[12px]"><span className="tabular-nums text-foreground">{label === 'value' ? inr(done) : done} / {label === 'value' ? inr(target!) : target}</span><span className={cn('tabular-nums', pct >= 100 ? 'text-success' : behind ? 'text-warning' : 'text-muted')}>{pct}%</span></div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-hover" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${label}: ${pct}% of target`}>
        <div className={cn('h-full rounded-full', pct >= 100 ? 'bg-success' : behind ? 'bg-warning' : 'bg-brand')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function TeamTargets({ orgId, month, people }: { orgId: string; month: string; people: Person[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState({ siteVisits: '', bookings: '', bookingValue: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now] = useState(() => new Date())
  const expected = expectedByNow(month, now)
  const monthLabel = new Date(`${month}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })

  function start(p: Person) {
    setEditing(p.profileId); setError(null)
    setDraft({ siteVisits: p.targets.siteVisits?.toString() ?? '', bookings: p.targets.bookings?.toString() ?? '', bookingValue: p.targets.bookingValue?.toString() ?? '' })
  }
  async function save(profileId: string) {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/team/targets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, profileId, month, targets: draft }) })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { setError(out.error ?? 'Could not save.'); return }
      setEditing(null); router.refresh()
    } catch { setError('Network error. Please try again.') } finally { setBusy(false) }
  }

  return (
    <section aria-labelledby="targets-title" className="surface-raised overflow-hidden rounded-2xl border border-default bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-default bg-surface-hover px-5 py-3.5">
        <h3 id="targets-title" className="flex items-center gap-2 text-[13px] font-bold text-foreground"><Target aria-hidden className="size-4 text-brand" /> Targets · {monthLabel}</h3>
        <p className="text-[11px] text-muted">{expected}% of the month gone. Amber = more than 10 points behind that pace.</p>
      </div>
      {error && <div className="px-5 pt-3"><Alert tone="danger">{error}</Alert></div>}
      {people.length === 0 ? (
        <p className="p-6 text-center text-[13px] text-muted">No salespeople yet. Targets are for managers, team leads and sales executives.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead className="text-left text-[11px] uppercase tracking-wide text-muted">
              <tr className="border-b border-default"><th className="px-5 py-2.5 font-medium">Person</th><th className="px-5 py-2.5 font-medium">Site visits done</th><th className="px-5 py-2.5 font-medium">Bookings</th><th className="px-5 py-2.5 font-medium">Booking value</th><th className="px-5 py-2.5" /></tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {people.map((p) => editing === p.profileId ? (
                <tr key={p.profileId}>
                  <td className="px-5 py-3 font-medium text-foreground">{p.name}</td>
                  {(['siteVisits', 'bookings', 'bookingValue'] as const).map((k) => (
                    <td key={k} className="px-5 py-3"><Input inputMode="numeric" aria-label={`${p.name}: ${k === 'siteVisits' ? 'site visits' : k === 'bookings' ? 'bookings' : 'booking value in rupees'} target`} placeholder={k === 'bookingValue' ? '₹ e.g. 50000000' : 'No target'}
                      value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value.replace(/[^\d]/g, '') })} /></td>
                  ))}
                  <td className="whitespace-nowrap px-5 py-3 text-right">
                    <Button size="sm" loading={busy} onClick={() => save(p.profileId)}>Save</Button>{' '}
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
                  </td>
                </tr>
              ) : (
                <tr key={p.profileId}>
                  <td className="px-5 py-3 font-medium text-foreground">{p.name}</td>
                  <td className="px-5 py-3"><Bar done={p.progress.siteVisits} target={p.targets.siteVisits} expected={expected} label="visits" /></td>
                  <td className="px-5 py-3"><Bar done={p.progress.bookings} target={p.targets.bookings} expected={expected} label="bookings" /></td>
                  <td className="px-5 py-3"><Bar done={p.progress.bookingValue} target={p.targets.bookingValue} expected={expected} label="value" /></td>
                  <td className="px-5 py-3 text-right"><Button size="sm" variant="ghost" onClick={() => start(p)}>Set targets</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
