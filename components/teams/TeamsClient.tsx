'use client'
// components/teams/TeamsClient.tsx — the Teams page: a card per team (leader, people, projects, this month's numbers
// and rank, team achievements) and a side sheet to create or change a team. Every change goes through /api/teams,
// which checks the role again; saving a team also sets who is in its lead-routing pool.
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Crown, Medal, Pencil, Plus, Trash2, Trophy, UsersRound } from 'lucide-react'
import { Badge, Button, EmptyState, Field, Input, Textarea } from '@/components/ui'
import { Sheet, SheetContent, SheetFooter } from '@/components/ui/sheet'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils/cn'
import type { TeamTotals } from '@/lib/teams/structure'

interface Person { id: string; name: string; role: string }
export interface TeamCard {
  id: string; name: string; description: string | null; isActive: boolean
  leader: { id: string; name: string } | null
  members: { id: string; name: string; role: string; onDuty: boolean }[]
  projects: { id: string; name: string }[]
  rank: number | null; month: TeamTotals; allTime: TeamTotals
  achievements: { key: string; title: string; unlocked: boolean; progress: number }[]
}

const inr = (n: number) => (n >= 1e7 ? `₹${+(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${+(n / 1e5).toFixed(1)} L` : `₹${Math.round(n).toLocaleString('en-IN')}`)
const initials = (n: string) => n.split(/\s+/).map((x) => x[0]).join('').slice(0, 2).toUpperCase()

export function TeamsClient({ orgId, orgSlug, canManage, teams, sellers, leaders, projects }: {
  orgId: string; orgSlug: string; canManage: boolean; teams: TeamCard[]; sellers: Person[]; leaders: Person[]; projects: { id: string; name: string }[]
}) {
  const [editing, setEditing] = useState<TeamCard | 'new' | null>(null)
  const ordered = useMemo(() => [...teams].sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || a.name.localeCompare(b.name)), [teams])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-muted">{teams.length} team{teams.length === 1 ? '' : 's'} · ranked by deals closed this month, then revenue, then points per person.</p>
        <div className="flex gap-2">
          <Button asChild variant="secondary"><Link href={`/${orgSlug}/performance/team`}>Team performance</Link></Button>
          {canManage && <Button onClick={() => setEditing('new')}><Plus aria-hidden /> New team</Button>}
        </div>
      </div>

      {teams.length === 0 ? (
        <div className="surface-raised rounded-2xl border border-default bg-surface">
          <EmptyState icon={UsersRound} title="No teams yet" description="Create a team for each group that sells together — one per project, city or language. Give it a leader and its people." />
        </div>
      ) : (
        <ul className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ordered.map((t) => (
            <li key={t.id} className={cn('surface-raised flex flex-col rounded-2xl border border-default bg-surface p-5', !t.isActive && 'opacity-60')}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-[16px] font-semibold text-foreground">{t.name}</h2>
                  <p className="mt-0.5 flex items-center gap-1 text-[12px] text-muted"><Crown aria-hidden className="size-3.5 text-warning" /> {t.leader ? t.leader.name : 'No leader yet'}</p>
                </div>
                {t.rank !== null && <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl text-[13px] font-bold', t.rank === 1 ? 'medal-lit bg-warning-bg text-warning' : 'bg-surface-hover text-muted')} title="Rank this month">#{t.rank}</span>}
              </div>
              {!t.isActive && <Badge className="mt-2 self-start">Switched off</Badge>}

              <div className="mt-3 flex -space-x-2" aria-label={`${t.members.length} people`}>
                {t.members.slice(0, 8).map((m) => (
                  <span key={m.id} title={m.name} className="grid size-8 place-items-center rounded-full border-2 border-[var(--surface)] bg-brand-light text-[11px] font-semibold text-brand">{initials(m.name)}</span>
                ))}
                {t.members.length > 8 && <span className="grid size-8 place-items-center rounded-full border-2 border-[var(--surface)] bg-surface-hover text-[11px] text-muted">+{t.members.length - 8}</span>}
                {t.members.length === 0 && <span className="text-[12px] text-muted">Nobody in this team yet</span>}
              </div>
              {t.projects.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">{t.projects.map((p) => <Badge key={p.id} tone="brand">{p.name}</Badge>)}</div>
              )}

              <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
                {[['Assigned', t.month.assigned], ['Contacted', t.month.contacted], ['Visits', t.month.meetings], ['Closed', t.month.closed]].map(([l, v]) => (
                  <div key={l as string} className="rounded-xl bg-surface-muted py-2"><dt className="text-[11px] text-muted">{l}</dt><dd className="text-[16px] font-bold tabular-nums text-foreground">{v}</dd></div>
                ))}
              </dl>
              <p className="mt-2 text-[12px] text-muted">This month: {inr(t.month.revenue)} booked{t.month.conversionPct !== null ? ` · ${t.month.conversionPct}% conversion` : ''}</p>

              <div className="mt-3 border-t border-default pt-3">
                <p className="mb-1.5 flex items-center gap-1 text-[12px] font-medium text-foreground"><Trophy aria-hidden className="size-3.5 text-warning" /> Team achievements · {t.achievements.filter((a) => a.unlocked).length} of {t.achievements.length}</p>
                <ul className="flex flex-wrap gap-1">
                  {t.achievements.map((a) => (
                    <li key={a.key} title={a.unlocked ? `${a.title} — reached` : `${a.title} — ${Math.round(a.progress * 100)}% there`}
                      className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]', a.unlocked ? 'border-transparent bg-warning-bg font-medium text-warning' : 'border-default text-subtle')}>
                      <Medal aria-hidden className="size-3" /> {a.title}
                    </li>
                  ))}
                </ul>
              </div>

              {canManage && (
                <div className="mt-auto flex gap-2 pt-4">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(t)}><Pencil aria-hidden /> Edit team</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && <TeamEditor key={editing === 'new' ? 'new' : editing.id} orgId={orgId} team={editing === 'new' ? null : editing} sellers={sellers} leaders={leaders} projects={projects} onClose={() => setEditing(null)} />}
    </div>
  )
}

function TeamEditor({ orgId, team, sellers, leaders, projects, onClose }: {
  orgId: string; team: TeamCard | null; sellers: Person[]; leaders: Person[]; projects: { id: string; name: string }[]; onClose: () => void
}) {
  const router = useRouter()
  const [name, setName] = useState(team?.name ?? '')
  const [description, setDescription] = useState(team?.description ?? '')
  const [leader, setLeader] = useState(team?.leader?.id ?? '')
  const [members, setMembers] = useState<Set<string>>(new Set(team?.members.map((m) => m.id) ?? []))
  const [projectIds, setProjectIds] = useState<Set<string>>(new Set(team?.projects.map((p) => p.id) ?? []))
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null)
  // People already in the team stay listed even if they can no longer take leads (so they can be removed).
  const people = useMemo(() => {
    const ids = new Set(sellers.map((s) => s.id))
    return [...sellers, ...(team?.members ?? []).filter((m) => !ids.has(m.id))].sort((a, b) => a.name.localeCompare(b.name))
  }, [sellers, team])
  const toggle = (set: Set<string>, id: string, apply: (s: Set<string>) => void) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); apply(n) }

  async function save() {
    setBusy('save')
    try {
      const res = await fetch(team ? `/api/teams/${team.id}` : '/api/teams', {
        method: team ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, team: { name, description, leaderProfileId: leader || null, memberIds: [...members], projectIds: [...projectIds] } }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(out.error ?? 'Could not save the team.'); return }
      toast.success(team ? 'Team saved.' : 'Team created.', { description: `${members.size} ${members.size === 1 ? 'person' : 'people'} · new members also join the team’s lead routing.` })
      onClose(); router.refresh()
    } catch { toast.error('Network error. Please try again.') } finally { setBusy(null) }
  }
  async function remove() {
    if (!team || !window.confirm(`Delete the team “${team.name}”? Its people stay in the workspace; their numbers stay with them.`)) return
    setBusy('delete')
    try {
      const res = await fetch(`/api/teams/${team.id}?orgId=${orgId}`, { method: 'DELETE' })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(out.error ?? 'Could not delete the team.'); return }
      toast.success('Team deleted.'); onClose(); router.refresh()
    } catch { toast.error('Network error. Please try again.') } finally { setBusy(null) }
  }

  return (
    <Sheet open onOpenChange={(o) => { if (!o && !busy) onClose() }}>
      <SheetContent title={team ? `Edit ${team.name}` : 'New team'} description="A leader, the people who sell together, and the projects they sell.">
        <div className="space-y-5">
          <Field label="Team name" required><Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Skyline Towers team" /></Field>
          <Field label="What this team does" hint="Optional — shown to managers."><Textarea rows={2} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          <fieldset>
            <legend className="mb-1.5 text-[12px] font-medium text-foreground">Leader</legend>
            <p className="mb-2 text-[12px] text-muted">Owners, admins, managers and team leads can lead. A leader oversees the team’s leads; they receive leads only if they are also a member.</p>
            <div className="flex flex-wrap gap-1.5">
              <Chip on={!leader} onClick={() => setLeader('')}>No leader</Chip>
              {leaders.map((l) => <Chip key={l.id} on={leader === l.id} onClick={() => setLeader(l.id)}>{l.name}</Chip>)}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1.5 text-[12px] font-medium text-foreground">People · {members.size}</legend>
            <p className="mb-2 text-[12px] text-muted">Members share this team’s leads through lead routing and count towards its numbers.</p>
            <div className="flex flex-wrap gap-1.5">
              {people.map((p) => <Chip key={p.id} on={members.has(p.id)} onClick={() => toggle(members, p.id, setMembers)}>{p.name}</Chip>)}
              {people.length === 0 && <p className="text-[12px] text-muted">Nobody can take leads yet — invite salespeople from Team.</p>}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1.5 text-[12px] font-medium text-foreground">Projects · {projectIds.size}</legend>
            <div className="flex flex-wrap gap-1.5">
              {projects.map((p) => <Chip key={p.id} on={projectIds.has(p.id)} onClick={() => toggle(projectIds, p.id, setProjectIds)}>{p.name}</Chip>)}
              {projects.length === 0 && <p className="text-[12px] text-muted">No projects yet.</p>}
            </div>
          </fieldset>
          <SheetFooter className="justify-between">
            {team ? <Button variant="ghost" onClick={remove} loading={busy === 'delete'} disabled={!!busy}><Trash2 aria-hidden /> Delete</Button> : <span />}
            <Button onClick={save} loading={busy === 'save'} disabled={!!busy || !name.trim()}>{team ? 'Save team' : 'Create team'}</Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={cn('min-h-9 rounded-full border px-3 text-[13px]', on ? 'border-brand bg-brand-light font-medium text-brand' : 'border-default text-foreground hover:bg-surface-hover')}>
      {children}
    </button>
  )
}
