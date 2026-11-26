'use client'
// components/rewards/RewardsClient.tsx — the Rewards page (20260100): decisions waiting (managers), programmes with
// progress and standings, your rewards, and a side sheet to set up or change a programme. Every change goes through
// /api/rewards…, which checks the role again; winners come from the database, never from this page.
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, CalendarClock, Gift, Pencil, Plane, Plus, RefreshCw, Smartphone, Ticket, Trophy, Wallet } from 'lucide-react'
import { Badge, Button, EmptyState, Field, Input, Select, Textarea } from '@/components/ui'
import { Sheet, SheetContent, SheetFooter } from '@/components/ui/sheet'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils/cn'
import { CLAIM_STATUS, REWARD_METRICS, REWARD_TYPES, STEP_LABEL, budgetSeats, claimSteps, goalText, type ProgramInput, type RewardType } from '@/lib/rewards/rules'
import type { ClaimView, ProgramView, Standing } from '@/lib/dal/rewards'

type Progress = Record<string, { mine: Standing | null; top: Standing[]; rank: number | null; entrants: number }>
const ICON: Record<RewardType, React.ComponentType<{ className?: string }>> = { gadget: Smartphone, travel: Plane, gift_card: Ticket, cash: Wallet, custom: Gift }
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
const day = (d: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`))
const amount = (metric: ProgramInput['metric'], n: number) => (metric === 'revenue' ? inr(n) : n.toLocaleString('en-IN', { maximumFractionDigits: 2 }))

export function RewardsClient({ orgId, manager, profileId, myTeamIds, programs, progress, claims, teams, teamsEnabled }: {
  orgId: string; manager: boolean; profileId: string; myTeamIds: string[]
  programs: ProgramView[]; progress: Progress; claims: ClaimView[]; teams: { id: string; name: string }[]; teamsEnabled: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState<ProgramView | 'new' | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const waiting = claims.filter((c) => c.status === 'pending' || c.status === 'approved')
  const mine = claims.filter((c) => c.profileId === profileId || (!!c.teamId && myTeamIds.includes(c.teamId)))
  const running = programs.filter((p) => p.status === 'active'), ended = programs.filter((p) => p.status !== 'active')

  async function post(url: string, body: Record<string, unknown>, ok: string, key: string) {
    setBusy(key)
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, ...body }) })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(out.error ?? 'Something went wrong.'); return }
      toast.success(typeof out.winners === 'number' && out.winners > 0 ? `${ok} ${out.winners} new ${out.winners === 1 ? 'winner' : 'winners'}.` : ok)
      router.refresh()
    } catch { toast.error('Network error. Please try again.') } finally { setBusy(null) }
  }
  const step = (c: ClaimView, to: keyof typeof STEP_LABEL) => post(`/api/rewards/claims/${c.id}`, { to }, to === 'rejected' ? 'Reward not approved.' : `${STEP_LABEL[to]}: done.`, `${c.id}:${to}`)

  return (
    <div className="space-y-8">
      {manager && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-muted">{running.length} running · {waiting.length} waiting for you</p>
          <Button onClick={() => setEditing('new')}><Plus aria-hidden /> New reward</Button>
        </div>
      )}

      {manager && waiting.length > 0 && (
        <section aria-labelledby="waiting">
          <h2 id="waiting" className="mb-3 text-[14px] font-semibold text-foreground">Waiting for a decision</h2>
          <ul className="surface-raised divide-y divide-[var(--border)] rounded-2xl border border-default bg-surface">
            {waiting.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-foreground">{c.name} <span className="font-normal text-muted">won</span> {c.rewardDetail}</p>
                  <p className="text-[12px] text-muted">{c.programTitle}{c.place ? ` · #${c.place}` : ''} · {CLAIM_STATUS[c.status].label}</p>
                </div>
                <div className="flex gap-2">
                  {claimSteps(c.status, { manager, winner: false }).map((to) => (
                    <Button key={to} size="sm" variant={to === 'rejected' ? 'ghost' : to === 'approved' ? 'primary' : 'secondary'} loading={busy === `${c.id}:${to}`} disabled={!!busy} onClick={() => step(c, to)}>{STEP_LABEL[to]}</Button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="running">
        <h2 id="running" className="mb-3 text-[14px] font-semibold text-foreground">Running now</h2>
        {running.length === 0 ? (
          <div className="surface-raised rounded-2xl border border-default bg-surface">
            <EmptyState icon={Gift} title="No rewards running" description={manager ? 'Set a reward — a gadget, a trip, a voucher or a bonus — with a goal and a deadline. Winners are found from real CRM work.' : 'When your workspace runs a reward you can win, it shows here with your progress.'}
              action={manager ? <Button onClick={() => setEditing('new')}><Plus aria-hidden /> New reward</Button> : undefined} />
          </div>
        ) : (
          <div className="stagger grid gap-4 md:grid-cols-2">
            {running.map((p) => <ProgramCard key={p.id} p={p} pr={progress[p.id]} manager={manager} busy={busy} onEdit={() => setEditing(p)}
              onCheck={() => post(`/api/rewards/${p.id}`, { action: 'check' }, 'Checked.', `${p.id}:check`)}
              onCancel={() => { if (confirm(`Cancel “${p.title}”? Rewards already won stay; nobody new can win.`)) void post(`/api/rewards/${p.id}`, { action: 'cancel' }, 'Programme cancelled.', `${p.id}:cancel`) }} />)}
          </div>
        )}
      </section>

      <section aria-labelledby="mine">
        <h2 id="mine" className="mb-3 text-[14px] font-semibold text-foreground">{manager ? 'All rewards won' : 'Your rewards'}</h2>
        {(manager ? claims : mine).length === 0 ? <p className="text-[13px] text-muted">None yet.</p> : (
          <ul className="surface-raised divide-y divide-[var(--border)] rounded-2xl border border-default bg-surface">
            {(manager ? claims : mine).map((c) => {
              const winner = c.profileId === profileId || (!!c.teamId && myTeamIds.includes(c.teamId))
              const steps = manager ? [] : claimSteps(c.status, { manager: false, winner })
              const tone = CLAIM_STATUS[c.status].tone
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-foreground">{c.rewardDetail}{manager ? <span className="font-normal text-muted"> · {c.name}</span> : null}</p>
                    <p className="text-[12px] text-muted">{c.programTitle} · won {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(c.createdAt))}{c.note ? ` · “${c.note}”` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={tone}>{CLAIM_STATUS[c.status].label}</Badge>
                    {steps.map((to) => <Button key={to} size="sm" variant="secondary" loading={busy === `${c.id}:${to}`} disabled={!!busy} onClick={() => step(c, to)}>{STEP_LABEL[to]}</Button>)}
                    {manager && c.status === 'fulfilled' && <Button size="sm" variant="ghost" loading={busy === `${c.id}:redeemed`} disabled={!!busy} onClick={() => step(c, 'redeemed')}>{STEP_LABEL.redeemed}</Button>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {ended.length > 0 && (
        <section aria-labelledby="ended">
          <h2 id="ended" className="mb-3 text-[14px] font-semibold text-foreground">Ended</h2>
          <ul className="grid gap-2 text-[13px] sm:grid-cols-2">
            {ended.map((p) => <li key={p.id} className="well rounded-xl px-4 py-3"><span className="font-medium text-foreground">{p.title}</span> <span className="text-muted">· {p.rewardDetail} · {p.status === 'cancelled' ? 'cancelled' : `ended ${day(p.endsOn)}`} · {p.standing} {p.standing === 1 ? 'winner' : 'winners'}</span></li>)}
          </ul>
        </section>
      )}

      {editing && <ProgramSheet orgId={orgId} program={editing === 'new' ? null : editing} teams={teams} teamsEnabled={teamsEnabled} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); router.refresh() }} />}
    </div>
  )
}

function ProgramCard({ p, pr, manager, busy, onEdit, onCheck, onCancel }: { p: ProgramView; pr: Progress[string] | undefined; manager: boolean; busy: string | null; onEdit: () => void; onCheck: () => void; onCancel: () => void }) {
  const Icon = ICON[p.rewardType]
  const seats = budgetSeats(p)
  const limit = [seats, p.maxWinners].filter((x): x is number => x !== null).reduce((a, b) => Math.min(a, b), Infinity)
  const left = Number.isFinite(limit) ? Math.max(0, limit - p.standing) : null
  const mine = pr?.mine
  const pct = mine && p.goalKind === 'reach' && p.goalAmount ? Math.min(100, Math.round((mine.achieved / p.goalAmount) * 100)) : null
  return (
    <article className="surface-raised flex flex-col rounded-2xl border border-default bg-surface p-5">
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-light text-brand"><Icon className="size-5" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-foreground">{p.title}</h3>
          <p className="text-[13px] text-foreground">{p.rewardDetail}<span className="text-muted"> · {REWARD_TYPES[p.rewardType].label}{p.scope === 'team' ? ' · for a team' : ''}</span></p>
        </div>
      </div>
      {p.description && <p className="mt-2 text-[12px] text-muted">{p.description}</p>}
      <dl className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
        <div className="well rounded-lg px-3 py-2"><dt className="text-muted">Goal</dt><dd className="font-medium text-foreground">{goalText(p)}</dd></div>
        <div className="well rounded-lg px-3 py-2"><dt className="flex items-center gap-1 text-muted"><CalendarClock className="size-3" aria-hidden /> Deadline</dt><dd className="font-medium text-foreground">{day(p.endsOn)}</dd></div>
        <div className="well rounded-lg px-3 py-2"><dt className="text-muted">Won so far</dt><dd className="font-medium text-foreground">{p.standing}{left !== null ? ` · ${left} left` : ''}</dd></div>
        {manager && <div className="well rounded-lg px-3 py-2"><dt className="text-muted">Budget</dt><dd className="font-medium text-foreground">{p.budget === null ? 'No limit' : `${inr(p.standing * p.unitValue)} of ${inr(p.budget)}`}</dd></div>}
      </dl>
      {!manager && (
        <div className="mt-3">
          {mine ? (
            <>
              <p className="text-[12px] text-muted">{p.scope === 'team' ? `Your team (${mine.name})` : 'You'}: <span className="font-semibold text-foreground">{amount(p.metric, mine.achieved)}</span>{p.goalKind === 'top' && pr?.rank ? ` · #${pr.rank} of ${pr.entrants}` : ''}</p>
              {pct !== null && <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-hover" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress towards the goal"><div className={cn('h-full rounded-full', pct >= 100 ? 'bg-success' : 'bg-brand')} style={{ width: `${pct}%` }} /></div>}
            </>
          ) : <p className="text-[12px] text-muted">Your progress shows once you start.</p>}
        </div>
      )}
      {manager && pr && pr.top.length > 0 && (
        <ol className="mt-3 space-y-1 text-[12px]">
          {pr.top.map((s, i) => (
            <li key={s.profileId ?? s.teamId ?? i} className="flex justify-between gap-2"><span className="truncate text-foreground"><Trophy className={cn('mr-1 inline size-3', i === 0 ? 'text-warning' : 'text-subtle')} aria-hidden />{s.name}</span><span className="tabular-nums text-muted">{amount(p.metric, s.achieved)}</span></li>
          ))}
        </ol>
      )}
      {manager && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-default pt-3">
          <Button size="sm" variant="secondary" onClick={onEdit}><Pencil aria-hidden /> Change</Button>
          <Button size="sm" variant="ghost" onClick={onCheck} loading={busy === `${p.id}:check`} disabled={!!busy}><RefreshCw aria-hidden /> Check winners now</Button>
          <Button size="sm" variant="ghost" onClick={onCancel} loading={busy === `${p.id}:cancel`} disabled={!!busy}><Ban aria-hidden /> Cancel</Button>
        </div>
      )}
    </article>
  )
}

const today = () => new Date().toISOString().slice(0, 10)
const plus = (d: number) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10)
const ROLE_CHOICES = [['sales_exec', 'Sales executives'], ['team_lead', 'Team leads'], ['manager', 'Managers'], ['admin', 'Admins'], ['owner', 'Owners who sell']] as const

function ProgramSheet({ orgId, program, teams, teamsEnabled, onClose, onSaved }: { orgId: string; program: ProgramView | null; teams: { id: string; name: string }[]; teamsEnabled: boolean; onClose: () => void; onSaved: () => void }) {
  const locked = !!program && program.claims > 0
  const [f, setF] = useState(() => ({
    title: program?.title ?? '', description: program?.description ?? '', rewardType: program?.rewardType ?? 'gadget' as RewardType,
    rewardDetail: program?.rewardDetail ?? '', unitValue: program ? String(program.unitValue || '') : '', budget: program?.budget != null ? String(program.budget) : '',
    scope: program?.scope ?? 'person', eligibleRoles: program?.eligibleRoles ?? ['sales_exec', 'team_lead'], eligibleTeamIds: program?.eligibleTeamIds ?? [],
    goalKind: program?.goalKind ?? 'reach', metric: program?.metric ?? 'deals', goalAmount: program?.goalAmount != null ? String(program.goalAmount) : '',
    topN: program?.topN != null ? String(program.topN) : '3', maxWinners: program?.maxWinners != null ? String(program.maxWinners) : '',
    startsOn: program?.startsOn ?? today(), endsOn: program?.endsOn ?? plus(30),
  }))
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch })
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const seats = useMemo(() => (f.budget && Number(f.unitValue) > 0 ? Math.floor(Number(f.budget) / Number(f.unitValue)) : null), [f.budget, f.unitValue])

  async function save() {
    setBusy(true)
    try {
      const body = { ...f, unitValue: f.unitValue === '' ? 0 : Number(f.unitValue), budget: f.budget === '' ? null : Number(f.budget), goalAmount: f.goalKind === 'reach' ? Number(f.goalAmount) : null, topN: f.goalKind === 'top' ? Number(f.topN) : null, maxWinners: f.maxWinners === '' ? null : Number(f.maxWinners), description: f.description || null }
      const res = await fetch(program ? `/api/rewards/${program.id}` : '/api/rewards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(program ? { action: 'save', orgId, program: body } : { orgId, program: body }) })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(out.error ?? 'Could not save the reward.'); return }
      toast.success(program ? 'Reward updated.' : out.winners ? `Reward created — ${out.winners} already qualified.` : 'Reward created. Winners are found as the work comes in.')
      onSaved()
    } catch { toast.error('Network error. Please try again.') } finally { setBusy(false) }
  }

  return (
    <Sheet open onOpenChange={(o) => { if (!o && !busy) onClose() }}>
      <SheetContent title={program ? `Change ${program.title}` : 'New reward'} description="What it is, how to win it, and by when. Winners come from CRM records only.">
        <div className="space-y-5">
          <Field label="Name" required><Input value={f.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. December booking sprint" /></Field>
          <fieldset>
            <legend className="mb-1.5 text-[12px] font-medium text-foreground">Reward</legend>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {(Object.keys(REWARD_TYPES) as RewardType[]).map((t) => { const I = ICON[t]; return (
                <button key={t} type="button" aria-pressed={f.rewardType === t} onClick={() => set({ rewardType: t })}
                  className={cn('flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-left text-[12px]', f.rewardType === t ? 'border-brand bg-brand-light font-semibold text-brand' : 'border-default text-muted hover:text-foreground')}>
                  <I className="size-4 shrink-0" aria-hidden />{REWARD_TYPES[t].label}
                </button>) })}
            </div>
          </fieldset>
          <Field label="What exactly" required hint={REWARD_TYPES[f.rewardType].hint}><Input value={f.rewardDetail} maxLength={200} onChange={(e) => set({ rewardDetail: e.target.value })} placeholder="e.g. iPhone 16, 128 GB" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Value of one (₹)" hint="For the budget."><Input inputMode="decimal" value={f.unitValue} onChange={(e) => set({ unitValue: e.target.value.replace(/[^0-9.]/g, '') })} /></Field>
            <Field label="Budget (₹)" hint={seats !== null ? `Pays for ${seats} ${seats === 1 ? 'reward' : 'rewards'}.` : 'Empty = no limit.'}><Input inputMode="decimal" value={f.budget} onChange={(e) => set({ budget: e.target.value.replace(/[^0-9.]/g, '') })} /></Field>
          </div>
          {locked && <p className="well rounded-lg px-3 py-2 text-[12px] text-muted">Someone has already won, so the goal, dates and who can win are fixed.</p>}
          <fieldset disabled={locked} className="space-y-5 disabled:opacity-60">
            {teamsEnabled && (
              <Field label="Who competes"><Select value={f.scope} onChange={(e) => set({ scope: e.target.value as 'person' | 'team' })}><option value="person">People</option><option value="team">Teams</option></Select></Field>
            )}
            {f.scope === 'person' && (
              <fieldset>
                <legend className="mb-1.5 text-[12px] font-medium text-foreground">Who can win</legend>
                <div className="flex flex-wrap gap-1.5">{ROLE_CHOICES.map(([r, l]) => <Chip key={r} on={f.eligibleRoles.includes(r)} onClick={() => set({ eligibleRoles: toggle(f.eligibleRoles, r) })}>{l}</Chip>)}</div>
              </fieldset>
            )}
            {teams.length > 0 && (
              <fieldset>
                <legend className="mb-1.5 text-[12px] font-medium text-foreground">Only these teams <span className="font-normal text-muted">(none chosen = everyone)</span></legend>
                <div className="flex flex-wrap gap-1.5">{teams.map((t) => <Chip key={t.id} on={f.eligibleTeamIds.includes(t.id)} onClick={() => set({ eligibleTeamIds: toggle(f.eligibleTeamIds, t.id) })}>{t.name}</Chip>)}</div>
              </fieldset>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label="How to win"><Select value={f.goalKind} onChange={(e) => set({ goalKind: e.target.value as 'reach' | 'top' })}><option value="reach">Reach an amount</option><option value="top">Finish in the top places</option></Select></Field>
              <Field label="Counting"><Select value={f.metric} onChange={(e) => set({ metric: e.target.value as ProgramInput['metric'] })}>{Object.entries(REWARD_METRICS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}</Select></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {f.goalKind === 'reach'
                ? <Field label={f.metric === 'revenue' ? 'Amount to reach (₹)' : 'Amount to reach'} required><Input inputMode="decimal" value={f.goalAmount} onChange={(e) => set({ goalAmount: e.target.value.replace(/[^0-9.]/g, '') })} /></Field>
                : <Field label="Top how many" required><Input inputMode="numeric" value={f.topN} onChange={(e) => set({ topN: e.target.value.replace(/\D/g, '') })} /></Field>}
              <Field label="Most winners" hint="Empty = no limit."><Input inputMode="numeric" value={f.maxWinners} onChange={(e) => set({ maxWinners: e.target.value.replace(/\D/g, '') })} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Starts"><Input type="date" value={f.startsOn} onChange={(e) => set({ startsOn: e.target.value })} /></Field>
              <Field label="Deadline"><Input type="date" value={f.endsOn} onChange={(e) => set({ endsOn: e.target.value })} /></Field>
            </div>
          </fieldset>
          <Field label="Rules and details" hint="Optional — shown to everyone who can win."><Textarea rows={3} maxLength={1000} value={f.description} onChange={(e) => set({ description: e.target.value })} /></Field>
          <SheetFooter>
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={save} loading={busy} disabled={busy || !f.title.trim() || !f.rewardDetail.trim()}>{program ? 'Save changes' : 'Start reward'}</Button>
          </SheetFooter>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-pressed={on} onClick={onClick} className={cn('min-h-9 rounded-full border px-3 text-[12px]', on ? 'border-brand bg-brand-light font-semibold text-brand' : 'border-default text-muted hover:text-foreground')}>{children}</button>
}
