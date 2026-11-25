'use client'
// components/settings/SalesStructureForm.tsx — Settings → Sales structure: two switches, saved together.
// The API checks the role again; the database enforces "owner sells" on every assignment.
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Crown, UsersRound } from 'lucide-react'
import { Alert, Button } from '@/components/ui'
import { toast } from '@/components/ui/toast'
import type { SalesStructure } from '@/lib/sales/structure'
import { cn } from '@/lib/utils/cn'

function Switch({ checked, onChange, label, description, icon: Icon, children }: {
  checked: boolean; onChange: (v: boolean) => void; label: string; description: string; icon: typeof Crown; children?: React.ReactNode
}) {
  return (
    <div className={cn('rounded-2xl border p-4 transition-colors', checked ? 'border-brand bg-brand-light/40' : 'border-default')}>
      <div className="flex items-start gap-3">
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', checked ? 'bg-brand-light text-brand' : 'bg-surface-hover text-subtle')}><Icon aria-hidden className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-foreground">{label}</p>
          <p className="mt-0.5 text-[13px] text-muted">{description}</p>
        </div>
        <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
          className={cn('relative mt-1 h-7 w-12 shrink-0 rounded-full transition-colors', checked ? 'bg-brand' : 'bg-strong')}>
          <span className={cn('absolute left-0 top-1 size-5 rounded-full bg-surface shadow-sm transition-transform duration-200', checked ? 'translate-x-6' : 'translate-x-1')} />
        </button>
      </div>
      {children}
    </div>
  )
}

export function SalesStructureForm({ orgId, orgSlug, initial, ownerOpenLeads }: { orgId: string; orgSlug: string; initial: SalesStructure; ownerOpenLeads: number }) {
  const router = useRouter()
  const [v, setV] = useState(initial)
  const [busy, setBusy] = useState(false)
  const changed = v.ownerSells !== initial.ownerSells || v.teamsEnabled !== initial.teamsEnabled

  async function save() {
    setBusy(true)
    try {
      const res = await fetch('/api/settings/sales', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, ...v }) })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(out.error ?? 'Could not save.'); return }
      toast.success('Sales structure saved.', { description: v.ownerSells ? 'The owner can now receive leads.' : 'The owner now manages only; new leads go to the team.' })
      router.refresh()
    } catch { toast.error('Network error. Please try again.') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <Switch checked={v.ownerSells} onChange={(ownerSells) => setV({ ...v, ownerSells })} icon={Crown} label="The owner also sells"
        description={v.ownerSells
          ? 'The owner can be given leads (by routing or by hand), has a personal “My performance” page and appears on the leaderboard.'
          : 'The owner manages: watches every agent’s performance, the leaderboard and assignments from Team overview, and is never given leads.'}>
        {!v.ownerSells && ownerOpenLeads > 0 && (
          <Alert tone="info" className="mt-3">The owner still holds {ownerOpenLeads} open lead{ownerOpenLeads === 1 ? '' : 's'}. They stay with the owner until you <Link href={`/${orgSlug}/leads`} className="font-medium underline">hand them to someone</Link>.</Alert>
        )}
      </Switch>
      <Switch checked={v.teamsEnabled} onChange={(teamsEnabled) => setV({ ...v, teamsEnabled })} icon={UsersRound} label="Team structure"
        description="Organise salespeople into teams, each with a leader and, if you like, its own projects. Adds team-wise performance, leaderboards and achievements. Leave it off to manage everyone as one team.">
        {initial.teamsEnabled && <p className="mt-3 text-[13px]"><Link href={`/${orgSlug}/teams`} className="font-medium text-brand">Open Teams →</Link></p>}
      </Switch>
      <div className="flex items-center gap-3">
        <Button onClick={save} loading={busy} disabled={!changed}>Save</Button>
        {changed && <span className="text-[12px] text-muted">Unsaved changes</span>}
      </div>
    </div>
  )
}
