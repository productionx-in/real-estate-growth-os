'use client'
// components/settings/ArchiveTable.tsx — deleted leads kept for 30 days: restore as they were, or erase now.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw, Trash2 } from 'lucide-react'
import { Alert, Badge, Button } from '@/components/ui'
import type { ArchivedLead } from '@/lib/dal/archive'

const when = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

export function ArchiveTable({ orgId, orgSlug, leads}: { orgId: string; orgSlug: string; leads: ArchivedLead[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string; href?: string } | null>(null)

  async function act(l: ArchivedLead, action: 'restore' | 'erase') {
    if (action === 'erase' && !window.confirm(`Erase “${l.name}” for good? Its calls, notes, follow-ups, visits and documents are erased too. This can’t be undone.`)) return
    setBusy(l.id); setMsg(null)
    const res = action === 'restore'
      ? await fetch(`/api/archive/leads/${l.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId }) })
      : await fetch(`/api/archive/leads/${l.id}?orgId=${orgId}`, { method: 'DELETE' })
    const out = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { setMsg({ tone: 'danger', text: out.error ?? 'Something went wrong.' }); return }
    setMsg(action === 'restore'
      ? { tone: 'success', text: `“${l.name}” is back in Leads, exactly as it was.`, href: `/${orgSlug}/leads/${l.id}` }
      : { tone: 'success', text: `“${l.name}” was erased.` })
    router.refresh()
  }

  if (!leads.length) return <p className="rounded-lg border border-dashed border-default p-6 text-center text-[13px] text-muted">Nothing in the Archive. Deleted leads appear here for 30 days.</p>

  return (
    <div className="space-y-3">
      {msg && <Alert tone={msg.tone}>{msg.text} {msg.href && <a href={msg.href} className="font-medium underline">Open the lead</a>}</Alert>}
      <div className="surface-raised overflow-x-auto rounded-2xl border border-default bg-surface">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead className="bg-surface-muted text-left text-[11px] font-semibold uppercase tracking-wide text-subtle">
            <tr><th className="px-4 py-2.5">Lead</th><th className="px-4 py-2.5">Deleted</th><th className="px-4 py-2.5">Erased in</th><th className="px-4 py-2.5 text-right">Action</th></tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {leads.map((l) => {
              const { daysLeft } = l
              return (
                <tr key={l.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{l.name}</p>
                    <p className="text-[12px] text-muted">{[l.phone, l.source?.replace(/_/g, ' ')].filter(Boolean).join(' · ')}</p>
                  </td>
                  <td className="px-4 py-3 text-muted">{when(l.deletedAt)}{l.deletedBy ? ` by ${l.deletedBy}` : ''}</td>
                  <td className="px-4 py-3"><Badge tone={daysLeft <= 3 ? 'danger' : daysLeft <= 7 ? 'warning' : undefined}>{daysLeft} day{daysLeft === 1 ? '' : 's'}</Badge></td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" variant="secondary" loading={busy === l.id} onClick={() => act(l, 'restore')}><RotateCcw aria-hidden /> Restore</Button>
                      <Button size="sm" variant="ghost" disabled={busy === l.id} onClick={() => act(l, 'erase')} aria-label={`Erase ${l.name} now`}><Trash2 aria-hidden /> Erase now</Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
