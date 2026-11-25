'use client'
// components/performance/PerformanceManager.tsx — Targets & settings for owners and admins (app/(dashboard)/[orgSlug]/
// performance/manage). Saves through /api/performance/*; the server checks the role and the rules again.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, Plus, Trash2 } from 'lucide-react'
import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Select } from '@/components/ui'
import { Switch } from '@/components/notifications/AlertPreferences'
import {
  ACHIEVEMENT_METRICS, BADGE_ICONS, METRICS, PERIODS, TARGET_METRICS, XP_EVENTS,
  type GamificationSettings, type Metric, type Mission, type Period,
} from '@/lib/performance/rules'
import type { TargetRow } from '@/lib/dal/performance'

interface Person { id: string; name: string }
interface Ach { key: string; title: string; description: string; metric: string; threshold: number; window: string; xp: number; icon: string; custom: boolean; active: boolean; rewardNote: string | null }
interface Hist { id: number; action: string; when: string; by: string; what: string; change: string | null }
type Msg = { tone: 'success' | 'danger'; text: string } | null

async function send(url: string, method: string, body: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) return null
    return (await res.json().catch(() => ({}))).error ?? 'Could not save.'
  } catch { return 'Network error. Please try again.' }
}

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
const ACH_METRIC_LABEL: Record<string, string> = { ...Object.fromEntries(Object.entries(METRICS).map(([k, v]) => [k, v.label])), missions: 'Daily missions completed', targets: 'Targets reached', xp: 'Points earned' }

export function PerformanceManager({ orgId, settings, targets, people, teams, achievements, history }: {
  orgId: string; settings: GamificationSettings; targets: TargetRow[]; people: Person[]; teams: Person[]; achievements: Ach[]; history: Hist[]
}) {
  const router = useRouter()
  return (
    <div className="space-y-6">
      <TargetsSection orgId={orgId} targets={targets} people={people} teams={teams} history={history} onSaved={() => router.refresh()} />
      <SettingsSection orgId={orgId} initial={settings} onSaved={() => router.refresh()} />
      <AchievementsSection orgId={orgId} achievements={achievements} onSaved={() => router.refresh()} />
      <AdjustSection orgId={orgId} people={people} />
    </div>
  )
}

function TargetsSection({ orgId, targets, people, teams, history, onSaved }: { orgId: string; targets: TargetRow[]; people: Person[]; teams: Person[]; history: Hist[]; onSaved: () => void }) {
  const [f, setF] = useState({ scope: 'member' as 'member' | 'team' | 'everyone', who: people[0]?.id ?? '', metric: 'contacted' as Metric, amount: '', period: 'month' as Period, startsOn: today(), endsOn: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const [edit, setEdit] = useState<Record<string, string>>({})
  const nameOf = (t: TargetRow) => t.scope === 'member' ? people.find((p) => p.id === t.profile_id)?.name ?? 'A person' : t.scope === 'team' ? `Team · ${teams.find((x) => x.id === t.team_id)?.name ?? '—'}` : 'Everyone'
  async function create() {
    setBusy(true); setMsg(null)
    const err = await send('/api/performance/targets', 'POST', {
      orgId, scope: f.scope, ...(f.scope === 'member' ? { profileId: f.who } : f.scope === 'team' ? { teamId: f.who } : {}),
      metric: f.metric, amount: Number(f.amount), period: f.period, startsOn: f.startsOn, endsOn: f.endsOn || null,
    })
    setBusy(false)
    setMsg(err ? { tone: 'danger', text: err } : { tone: 'success', text: 'Target set. Progress counts from its start date.' })
    if (!err) { setF({ ...f, amount: '' }); onSaved() }
  }
  async function patch(id: string, body: Record<string, unknown>) {
    const err = await send(`/api/performance/targets/${id}`, 'PATCH', { orgId, ...body })
    setMsg(err ? { tone: 'danger', text: err } : { tone: 'success', text: 'Saved. Progress is recalculated from the record of what people did.' })
    if (!err) onSaved()
  }
  const whoOptions = f.scope === 'member' ? people : f.scope === 'team' ? teams : []
  return (
    <Card>
      <CardHeader><div><CardTitle>Targets</CardTitle><CardDescription>For one person, a team, or everyone. A personal target overrides a team one, which overrides everyone’s, for the same activity and period.</CardDescription></div></CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-[12px] font-medium text-muted">For
            <Select value={f.scope} onChange={(e) => { const scope = e.target.value as typeof f.scope; setF({ ...f, scope, who: scope === 'member' ? people[0]?.id ?? '' : scope === 'team' ? teams[0]?.id ?? '' : '' }) }}>
              <option value="member">One person</option><option value="team" disabled={!teams.length}>A team{teams.length ? '' : ' (no teams yet)'}</option><option value="everyone">Everyone</option>
            </Select>
          </label>
          {f.scope !== 'everyone' && (
            <label className="space-y-1 text-[12px] font-medium text-muted">{f.scope === 'member' ? 'Person' : 'Team'}
              <Select value={f.who} onChange={(e) => setF({ ...f, who: e.target.value })}>{whoOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>
            </label>
          )}
          <label className="space-y-1 text-[12px] font-medium text-muted">Activity
            <Select value={f.metric} onChange={(e) => setF({ ...f, metric: e.target.value as Metric })}>{TARGET_METRICS.map((m) => <option key={m} value={m}>{METRICS[m].label}</option>)}</Select>
          </label>
          <label className="space-y-1 text-[12px] font-medium text-muted">{f.metric === 'revenue' ? 'Amount (₹)' : 'How many'}
            <Input type="number" inputMode="numeric" min={1} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
          </label>
          <label className="space-y-1 text-[12px] font-medium text-muted">Every
            <Select value={f.period} onChange={(e) => setF({ ...f, period: e.target.value as Period })}>{(Object.keys(PERIODS) as Period[]).map((p) => <option key={p} value={p}>{PERIODS[p]}</option>)}</Select>
          </label>
          <label className="space-y-1 text-[12px] font-medium text-muted">From<Input type="date" value={f.startsOn} onChange={(e) => setF({ ...f, startsOn: e.target.value })} /></label>
          <label className="space-y-1 text-[12px] font-medium text-muted">{f.period === 'custom' ? 'Until' : 'Until (optional)'}<Input type="date" value={f.endsOn} onChange={(e) => setF({ ...f, endsOn: e.target.value })} /></label>
          <div className="flex items-end"><Button onClick={create} loading={busy} disabled={!f.amount || (f.scope !== 'everyone' && !f.who)}><Plus aria-hidden /> Set target</Button></div>
        </div>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        {targets.length === 0 ? <p className="text-[13px] text-muted">No targets yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead className="text-[12px] text-muted"><tr className="border-b border-default"><th className="py-2 font-medium">For</th><th className="py-2 font-medium">Activity</th><th className="py-2 font-medium">Period</th><th className="py-2 font-medium">Dates</th><th className="py-2 text-right font-medium">Target</th><th className="py-2" /></tr></thead>
              <tbody className="divide-y divide-[var(--border)]">
                {targets.map((t) => (
                  <tr key={t.id}>
                    <td className="py-2.5 pr-2 font-medium text-foreground">{nameOf(t)}</td>
                    <td className="py-2.5 pr-2">{METRICS[t.metric].label}</td>
                    <td className="py-2.5 pr-2">{PERIODS[t.period]}</td>
                    <td className="py-2.5 pr-2 text-muted">{t.starts_on}{t.ends_on ? ` → ${t.ends_on}` : ' onwards'}</td>
                    <td className="py-2.5 text-right">
                      <Input aria-label="Target amount" type="number" min={1} className="ml-auto h-8 w-28 text-right" value={edit[t.id] ?? String(t.amount)} onChange={(e) => setEdit({ ...edit, [t.id]: e.target.value })} />
                    </td>
                    <td className="py-2.5 pl-2 text-right whitespace-nowrap">
                      {edit[t.id] !== undefined && Number(edit[t.id]) !== t.amount && <Button size="sm" onClick={() => patch(t.id, { amount: Number(edit[t.id]) })}>Save</Button>}
                      <Button size="sm" variant="ghost" aria-label="Retire this target" title="Retire (kept in history)" onClick={() => patch(t.id, { archive: true })}><Archive aria-hidden /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {history.length > 0 && (
          <details className="rounded-lg border border-default p-3">
            <summary className="cursor-pointer text-[13px] font-medium text-foreground">Change history ({history.length})</summary>
            <ul className="mt-2 space-y-1.5 text-[12px] text-muted">
              {history.map((h) => (
                <li key={h.id}><span className="text-foreground">{h.by}</span> {h.action} <span className="text-foreground">{h.what}</span>{h.change ? ` (${h.change})` : ''} · {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(h.when))}</li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  )
}

function SettingsSection({ orgId, initial, onSaved }: { orgId: string; initial: GamificationSettings; onSaved: () => void }) {
  const [s, setS] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const num = (v: string) => (v === '' ? NaN : Math.round(Number(v)))
  async function save() {
    setBusy(true); setMsg(null)
    const err = await send('/api/performance/settings', 'POST', { orgId, value: s })
    setBusy(false)
    setMsg(err ? { tone: 'danger', text: err } : { tone: 'success', text: 'Saved. New points apply from now on; what people already earned stays.' })
    if (!err) onSaved()
  }
  const setMission = (i: number, m: Partial<Mission>) => setS({ ...s, missions: s.missions.map((x, j) => (j === i ? { ...x, ...m } : x)) })
  return (
    <Card>
      <CardHeader className="items-center">
        <div><CardTitle>Points, levels and missions</CardTitle><CardDescription>Points only come from real activity in REGrow. An assignment never earns points.</CardDescription></div>
        <Switch on={s.enabled} label="Points and missions" onChange={(v) => setS({ ...s, enabled: v })} />
      </CardHeader>
      <CardContent className={`space-y-6 ${s.enabled ? '' : 'opacity-60'}`}>
        <div>
          <p className="mb-2 text-[13px] font-semibold text-foreground">Points per activity</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(XP_EVENTS) as (keyof typeof XP_EVENTS)[]).map((k) => (
              <label key={k} className="flex items-center justify-between gap-3 rounded-lg border border-default p-2.5 text-[13px]">{XP_EVENTS[k].label}
                <Input type="number" min={0} max={1000} className="h-8 w-20 text-right" value={Number.isNaN(s.xp[k]) ? '' : s.xp[k]} onChange={(e) => setS({ ...s, xp: { ...s.xp, [k]: num(e.target.value) } })} />
              </label>
            ))}
            <label className="flex items-center justify-between gap-3 rounded-lg border border-default p-2.5 text-[13px]">Follow-ups that earn points, per day
              <Input type="number" min={0} max={500} className="h-8 w-20 text-right" value={Number.isNaN(s.followUpDailyCap) ? '' : s.followUpDailyCap} onChange={(e) => setS({ ...s, followUpDailyCap: num(e.target.value) })} />
            </label>
          </div>
          <p className="mt-2 text-[12px] text-muted">Un-booking a deal takes its points back; re-booking can never earn more than one deal.</p>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-semibold text-foreground">Levels</p>
          <div className="space-y-2">
            {s.levels.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-16 text-[12px] text-muted">Level {i + 1}</span>
                <Input aria-label={`Level ${i + 1} name`} className="h-9 max-w-[220px]" value={l.name} onChange={(e) => setS({ ...s, levels: s.levels.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                <Input aria-label={`Level ${i + 1} starts at points`} type="number" min={0} disabled={i === 0} className="h-9 w-28" value={l.xp} onChange={(e) => setS({ ...s, levels: s.levels.map((x, j) => (j === i ? { ...x, xp: num(e.target.value) } : x)) })} />
                <span className="text-[12px] text-muted">XP</span>
                {i > 0 && s.levels.length > 2 && <Button size="sm" variant="ghost" aria-label={`Remove level ${i + 1}`} onClick={() => setS({ ...s, levels: s.levels.filter((_, j) => j !== i) })}><Trash2 aria-hidden /></Button>}
              </div>
            ))}
            {s.levels.length < 12 && <Button size="sm" variant="secondary" onClick={() => setS({ ...s, levels: [...s.levels, { name: '', xp: (s.levels.at(-1)?.xp ?? 0) + 1000 }] })}><Plus aria-hidden /> Add level</Button>}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-semibold text-foreground">Daily missions</p>
          <div className="space-y-2">
            {s.missions.map((m, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Input aria-label="Mission title" className="h-9 min-w-[180px] flex-1" value={m.title} onChange={(e) => setMission(i, { title: e.target.value })} />
                <Select aria-label="Activity" className="h-9 w-auto" value={m.metric} onChange={(e) => setMission(i, { metric: e.target.value as Metric })}>
                  {TARGET_METRICS.filter((x) => x !== 'revenue').map((x) => <option key={x} value={x}>{METRICS[x].short}</option>)}
                </Select>
                <Input aria-label="How many" type="number" min={1} className="h-9 w-20" value={m.count} onChange={(e) => setMission(i, { count: num(e.target.value) })} />
                <Input aria-label="Points" type="number" min={0} className="h-9 w-20" value={m.xp} onChange={(e) => setMission(i, { xp: num(e.target.value) })} />
                <span className="text-[12px] text-muted">XP</span>
                <Button size="sm" variant="ghost" aria-label="Remove mission" onClick={() => setS({ ...s, missions: s.missions.filter((_, j) => j !== i) })}><Trash2 aria-hidden /></Button>
              </div>
            ))}
            {s.missions.length < 6 && <Button size="sm" variant="secondary" onClick={() => setS({ ...s, missions: [...s.missions, { key: `m${Date.now() % 100000}`, title: 'Contact 3 leads', metric: 'contacted', count: 3, xp: 10 }] })}><Plus aria-hidden /> Add mission</Button>}
          </div>
        </div>

        <div>
          <p className="mb-2 text-[13px] font-semibold text-foreground">Leaderboard</p>
          <label className="flex items-center gap-2 text-[13px]">Who sees the whole team
            <Select className="h-9 w-auto" value={s.leaderboard.visibleTo} onChange={(e) => setS({ ...s, leaderboard: { ...s.leaderboard, visibleTo: e.target.value as 'everyone' | 'managers' } })}>
              <option value="everyone">Everyone who sells</option><option value="managers">Owners, admins and managers only</option>
            </Select>
          </label>
          <p className="mt-1 text-[12px] text-muted">People always see their own rank. Owners, admins and managers always see every column.</p>
          <div className="mt-3 flex flex-wrap gap-4">
            {([['xp', 'Points'], ['contacted', 'Leads contacted'], ['closed', 'Deals closed'], ['revenue', 'Revenue'], ['target', 'Target completion']] as const).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-[13px]">
                <Switch on={s.leaderboard.show[k]} label={`Show ${label} to colleagues`} onChange={(v) => setS({ ...s, leaderboard: { ...s.leaderboard, show: { ...s.leaderboard.show, [k]: v } } })} /> {label}
              </label>
            ))}
          </div>
        </div>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <Button onClick={save} loading={busy}>Save points, levels and missions</Button>
      </CardContent>
    </Card>
  )
}

function AchievementsSection({ orgId, achievements, onSaved }: { orgId: string; achievements: Ach[]; onSaved: () => void }) {
  const [f, setF] = useState({ title: '', description: '', metric: 'closed', threshold: '5', window: 'all', xp: '50', icon: 'star', rewardNote: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  async function toggle(key: string, active: boolean) {
    const err = await send('/api/performance/achievements', 'POST', { action: 'toggle', orgId, key, active })
    setMsg(err ? { tone: 'danger', text: err } : null)
    if (!err) onSaved()
  }
  async function create() {
    setBusy(true); setMsg(null)
    const err = await send('/api/performance/achievements', 'POST', { action: 'save', orgId, title: f.title, description: f.description, metric: f.metric, threshold: Number(f.threshold), window: f.window, xp: Number(f.xp), icon: f.icon, rewardNote: f.rewardNote || null })
    setBusy(false)
    setMsg(err ? { tone: 'danger', text: err } : { tone: 'success', text: 'Achievement added. People unlock it the moment their record reaches it.' })
    if (!err) { setF({ ...f, title: '', description: '', rewardNote: '' }); onSaved() }
  }
  return (
    <Card>
      <CardHeader><div><CardTitle>Achievements</CardTitle><CardDescription>Switch built-in badges on or off, and add your own. A reward note is shown with the badge; REGrow promises no rewards itself.</CardDescription></div></CardHeader>
      <CardContent className="space-y-5">
        <ul className="grid gap-2 sm:grid-cols-2">
          {achievements.map((a) => (
            <li key={a.key} className="flex items-center justify-between gap-3 rounded-lg border border-default p-2.5">
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-foreground">{a.title}{a.custom && <span className="ml-1.5 text-[11px] font-normal text-brand">yours</span>}</p>
                <p className="truncate text-[12px] text-muted">{a.threshold.toLocaleString('en-IN')} · {ACH_METRIC_LABEL[a.metric] ?? a.metric}{a.window !== 'all' ? ` in a ${a.window}` : ''} · {a.xp} XP</p>
              </div>
              <Switch on={a.active} label={`${a.title} on`} onChange={(v) => toggle(a.key, v)} />
            </li>
          ))}
        </ul>
        <div className="rounded-lg border border-default p-3">
          <p className="mb-2 text-[13px] font-semibold text-foreground">Add your own</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Input aria-label="Title" placeholder="Title, e.g. Weekend warrior" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
            <Input aria-label="Description" placeholder="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
            <Select aria-label="Counts" value={f.metric} onChange={(e) => setF({ ...f, metric: e.target.value })}>{ACHIEVEMENT_METRICS.map((m) => <option key={m} value={m}>{ACH_METRIC_LABEL[m]}</option>)}</Select>
            <Input aria-label="How many" type="number" min={1} value={f.threshold} onChange={(e) => setF({ ...f, threshold: e.target.value })} />
            <Select aria-label="Within" value={f.window} onChange={(e) => setF({ ...f, window: e.target.value })}><option value="all">In total</option><option value="week">In one week</option><option value="month">In one month</option></Select>
            <Input aria-label="Points" type="number" min={0} value={f.xp} onChange={(e) => setF({ ...f, xp: e.target.value })} />
            <Select aria-label="Badge" value={f.icon} onChange={(e) => setF({ ...f, icon: e.target.value })}>{BADGE_ICONS.map((i) => <option key={i} value={i}>{i[0].toUpperCase() + i.slice(1)}</option>)}</Select>
            <Input aria-label="Reward note" placeholder="Reward note (optional)" value={f.rewardNote} onChange={(e) => setF({ ...f, rewardNote: e.target.value })} />
          </div>
          <Button className="mt-3" onClick={create} loading={busy} disabled={f.title.trim().length < 2}><Plus aria-hidden /> Add achievement</Button>
        </div>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      </CardContent>
    </Card>
  )
}

function AdjustSection({ orgId, people }: { orgId: string; people: Person[] }) {
  const [f, setF] = useState({ profileId: people[0]?.id ?? '', xp: '', reason: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  async function save() {
    setBusy(true); setMsg(null)
    const err = await send('/api/performance/adjust', 'POST', { orgId, profileId: f.profileId, xp: Number(f.xp), reason: f.reason })
    setBusy(false)
    setMsg(err ? { tone: 'danger', text: err } : { tone: 'success', text: 'Points adjusted and recorded in the audit log.' })
    if (!err) setF({ ...f, xp: '', reason: '' })
  }
  return (
    <Card>
      <CardHeader><div><CardTitle>Correct points</CardTitle><CardDescription>For shared deals or mistakes: add or take away points with a reason. Counts (contacts, deals, revenue) never change by hand.</CardDescription></div></CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-[1fr_120px_2fr_auto]">
          <Select aria-label="Person" value={f.profileId} onChange={(e) => setF({ ...f, profileId: e.target.value })}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
          <Input aria-label="Points (negative to take away)" type="number" placeholder="e.g. 50 or -50" value={f.xp} onChange={(e) => setF({ ...f, xp: e.target.value })} />
          <Input aria-label="Reason" placeholder="Reason, e.g. Shared the Patel booking with Ravi" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
          <Button onClick={save} loading={busy} disabled={!f.xp || Number(f.xp) === 0 || f.reason.trim().length < 5}>Apply</Button>
        </div>
        {msg && <Alert className="mt-3" tone={msg.tone}>{msg.text}</Alert>}
      </CardContent>
    </Card>
  )
}
