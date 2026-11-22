'use client'
// components/routing/RoutingSettingsClient.tsx
// Lead routing settings screen: teams and their members, routing rules, and recent routing decisions.
// Every change goes through /api/routing/*, which re-checks the caller's role and the organisation server-side;
// the database then enforces same-organisation integrity, so this screen holds no authorisation logic.
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, ArrowDown, ArrowUp, Plus, Trash2, Users, Workflow, History, Zap } from 'lucide-react'
import type { listRecentRoutingDecisions, listRules, listTeams } from '@/lib/dal/routing'
import { LEAD_SOURCES } from '@/lib/validations/routing'
import type { MemberRole } from '@/types/database'

type Ok<T> = Awaited<T> extends infer R ? (R extends { success: true; data: infer D } ? D : never) : never
type Team = Ok<ReturnType<typeof listTeams>>[number]
type Rule = Ok<ReturnType<typeof listRules>>[number]
type Decision = Ok<ReturnType<typeof listRecentRoutingDecisions>>[number]

export interface RoutingPageData {
  teams: Team[]
  rules: Rule[]
  decisions: Decision[]
  members: { profileId: string; role: MemberRole; name: string }[]
  projects: { id: string; name: string }[]
}

const SOURCE_LABELS: Record<(typeof LEAD_SOURCES)[number], string> = {
  website: 'Website', meta_ads: 'Meta Ads', google_ads: 'Google Ads', '99acres': '99acres', housing: 'Housing.com',
  magicbricks: 'MagicBricks', whatsapp: 'WhatsApp', referral: 'Referral', walk_in: 'Walk-in', csv_import: 'CSV import', other: 'Other',
}

const OUTCOME_LABELS: Record<string, { label: string; className: string }> = {
  assigned: { label: 'Assigned', className: 'bg-success-bg text-success border-success/30' },
  sticky: { label: 'Returning buyer', className: 'bg-brand-light text-brand border-brand/30' },
  no_matching_rule: { label: 'No rule matched', className: 'bg-warning-bg text-warning border-warning/30' },
  no_available_member: { label: 'Nobody available', className: 'bg-danger-bg text-danger border-danger/30' },
  sla_reassigned: { label: 'Reassigned', className: 'bg-warning-bg text-warning border-warning/30' },
}

const card = 'bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-2xs'
const input = 'px-2.5 py-1.5 text-[12px] rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-brand-light'
const btn = 'px-3 py-1.5 text-[12px] font-semibold rounded-lg border transition-colors disabled:opacity-50'
const btnPrimary = `${btn} bg-brand text-brand-foreground border-brand hover:bg-brand`
const btnGhost = `${btn} bg-[var(--surface)] text-[var(--foreground)] border-[var(--border)] hover:bg-surface-muted`

async function call(method: string, url: string, body?: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    if (res.ok) return null
    const json = await res.json().catch(() => ({}))
    return json.error || `Request failed (${res.status})`
  } catch {
    return 'Network error — please try again'
  }
}

const splitIds = (s: string) => s.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean)

export function RoutingSettingsClient({ orgId, orgSlug, data, loadError }: {
  orgId: string
  orgSlug: string
  data: RoutingPageData
  loadError: string | null
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(loadError)
  const [newTeam, setNewTeam] = useState('')
  const [editingRule, setEditingRule] = useState<Rule | 'new' | null>(null)

  const activeRules = data.rules.filter((r) => r.is_active)
  const teamNames = useMemo(() => new Map(data.teams.map((t) => [t.id, t.name])), [data.teams])

  async function run(method: string, url: string, body?: unknown): Promise<boolean> {
    setBusy(true)
    setError(null)
    const err = await call(method, url, body)
    setBusy(false)
    if (err) {
      setError(err)
      return false
    }
    router.refresh()
    return true
  }

  const q = `orgId=${encodeURIComponent(orgId)}`

  return (
    <div className="max-w-5xl space-y-6">
      {error && (
        <div role="alert" className="p-3 rounded-xl bg-danger-bg border border-danger/30 text-danger text-[12px] flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Status */}
      <div className={`${card} flex items-start gap-3`}>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${activeRules.length ? 'bg-success-bg text-success' : 'bg-warning-bg text-warning'}`}>
          <Zap className="w-4 h-4" />
        </div>
        <div className="text-[12px] text-[var(--foreground-muted)]">
          {activeRules.length ? (
            <p>
              <span className="font-semibold text-[var(--foreground)]">Rule-based routing is on.</span>{' '}
              {activeRules.length === 1 ? '1 active rule decides' : `${activeRules.length} active rules decide`} who gets each new lead, top to bottom.
              A lead no rule matches stays unassigned, and managers are notified.
            </p>
          ) : (
            <p>
              <span className="font-semibold text-[var(--foreground)]">No active rules yet.</span>{' '}
              New leads are shared in turn among all active sales executives. Create a team and a rule to control who gets which leads.
            </p>
          )}
        </div>
      </div>

      {/* Teams */}
      <section className={card} aria-labelledby="teams-heading">
        <div className="flex items-center justify-between mb-4">
          <h2 id="teams-heading" className="text-[13px] font-semibold text-[var(--foreground)] flex items-center gap-2">
            <Users className="w-4 h-4" /> Teams
          </h2>
          <form
            className="flex items-center gap-2"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!newTeam.trim()) return
              if (await run('POST', '/api/routing/teams', { orgId, name: newTeam.trim() })) setNewTeam('')
            }}
          >
            <input className={input} placeholder="New team name" value={newTeam} maxLength={80}
              onChange={(e) => setNewTeam(e.target.value)} aria-label="New team name" />
            <button type="submit" className={btnPrimary} disabled={busy || !newTeam.trim()}>
              <Plus className="w-3.5 h-3.5 inline -mt-0.5" /> Add team
            </button>
          </form>
        </div>

        {data.teams.length === 0 ? (
          <p className="text-[12px] text-[var(--foreground-muted)]">
            No teams yet. A team is a group of salespeople that shares leads — for example one per project or one per language.
          </p>
        ) : (
          <div className="space-y-4">
            {data.teams.map((team) => (
              <TeamCard key={team.id} team={team} orgId={orgId} members={data.members} busy={busy} run={run} q={q} />
            ))}
          </div>
        )}
      </section>

      {/* Rules */}
      <section className={card} aria-labelledby="rules-heading">
        <div className="flex items-center justify-between mb-1">
          <h2 id="rules-heading" className="text-[13px] font-semibold text-[var(--foreground)] flex items-center gap-2">
            <Workflow className="w-4 h-4" /> Routing rules
          </h2>
          <button type="button" className={btnPrimary} disabled={busy || data.teams.length === 0}
            onClick={() => setEditingRule('new')} title={data.teams.length === 0 ? 'Create a team first' : undefined}>
            <Plus className="w-3.5 h-3.5 inline -mt-0.5" /> Add rule
          </button>
        </div>
        <p className="text-[12px] text-[var(--foreground-muted)] mb-4">
          Rules are checked from the top. The first rule whose conditions match a new lead decides the team. Empty conditions match everything.
        </p>

        {editingRule && (
          <RuleForm
            key={editingRule === 'new' ? 'new' : editingRule.id}
            rule={editingRule === 'new' ? null : editingRule}
            orgId={orgId}
            teams={data.teams}
            projects={data.projects}
            nextPriority={(data.rules.at(-1)?.priority ?? 0) + 10}
            busy={busy}
            onCancel={() => setEditingRule(null)}
            onSave={async (body, ruleId) => {
              const ok = ruleId
                ? await run('PATCH', `/api/routing/rules/${ruleId}`, body)
                : await run('POST', '/api/routing/rules', body)
              if (ok) setEditingRule(null)
            }}
          />
        )}

        {data.rules.length === 0 ? (
          <p className="text-[12px] text-[var(--foreground-muted)]">No rules yet.</p>
        ) : (
          <ol className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-lg">
            {data.rules.map((rule, i) => (
              <li key={rule.id} className="p-3 flex items-start gap-3">
                <div className="flex flex-col gap-0.5 pt-0.5">
                  <button type="button" aria-label={`Move ${rule.name} up`} disabled={busy || i === 0}
                    className="text-[var(--foreground-muted)] disabled:opacity-30"
                    onClick={() => swapPriority(rule, data.rules[i - 1])}><ArrowUp className="w-3.5 h-3.5" /></button>
                  <button type="button" aria-label={`Move ${rule.name} down`} disabled={busy || i === data.rules.length - 1}
                    className="text-[var(--foreground-muted)] disabled:opacity-30"
                    onClick={() => swapPriority(rule, data.rules[i + 1])}><ArrowDown className="w-3.5 h-3.5" /></button>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[13px] font-semibold ${rule.is_active ? 'text-[var(--foreground)]' : 'text-[var(--foreground-muted)] line-through'}`}>{rule.name}</span>
                    {!rule.is_active && <span className="text-[11px] text-[var(--foreground-muted)]">(paused)</span>}
                  </div>
                  <p className="text-[12px] text-[var(--foreground-muted)] mt-0.5">
                    {describeConditions(rule, data.projects)} → <span className="font-medium text-[var(--foreground)]">{teamNames.get(rule.team_id) ?? 'Unknown team'}</span>
                    {' · '}{rule.strategy === 'least_open' ? 'fewest open leads' : 'take turns (weighted)'}
                    {' · '}{rule.sticky_days > 0 ? `returning buyers go back to the same person for ${rule.sticky_days} days` : 'no returning-buyer stickiness'}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button type="button" className={btnGhost} disabled={busy}
                    onClick={() => run('PATCH', `/api/routing/rules/${rule.id}`, { orgId, isActive: !rule.is_active })}>
                    {rule.is_active ? 'Pause' : 'Resume'}
                  </button>
                  <button type="button" className={btnGhost} disabled={busy} onClick={() => setEditingRule(rule)}>Edit</button>
                  <button type="button" className={`${btn} text-danger border-danger/30 hover:bg-danger-bg`} disabled={busy}
                    aria-label={`Delete rule ${rule.name}`}
                    onClick={() => { if (confirm(`Delete rule “${rule.name}”?`)) run('DELETE', `/api/routing/rules/${rule.id}?${q}`) }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Recent decisions */}
      <section className={card} aria-labelledby="activity-heading">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 id="activity-heading" className="text-[13px] font-semibold text-[var(--foreground)] flex items-center gap-2">
            <History className="w-4 h-4" /> Recent routing decisions
          </h2>
          <Link href={`/${orgSlug}/routing/log`} className="text-[12px] font-medium text-brand hover:underline">Full assignment log</Link>
        </div>
        {data.decisions.length === 0 ? (
          <p className="text-[12px] text-[var(--foreground-muted)]">Nothing routed by rules yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[var(--foreground-muted)] border-b border-[var(--border)]">
                  <th className="py-2 pr-3 font-medium">When</th>
                  <th className="py-2 pr-3 font-medium">Lead</th>
                  <th className="py-2 pr-3 font-medium">Outcome</th>
                  <th className="py-2 pr-3 font-medium">Assigned to</th>
                  <th className="py-2 font-medium">Rule / team</th>
                </tr>
              </thead>
              <tbody>
                {data.decisions.map((d) => {
                  const outcome = OUTCOME_LABELS[d.outcome] ?? { label: d.outcome, className: 'bg-surface-muted text-muted border-default' }
                  const detail = (d.detail ?? {}) as { rule_name?: string; team_name?: string }
                  return (
                    <tr key={d.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-2 pr-3 whitespace-nowrap text-[var(--foreground-muted)]">{new Date(d.decided_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                      <td className="py-2 pr-3">
                        {d.lead ? <Link className="text-brand hover:underline" href={`/${orgSlug}/leads/${d.lead.id}`}>{d.lead.name}</Link> : <span className="text-[var(--foreground-muted)]">Deleted lead</span>}
                      </td>
                      <td className="py-2 pr-3"><span className={`inline-flex px-2 py-0.5 rounded-full border text-[11px] font-medium ${outcome.className}`}>{outcome.label}</span></td>
                      <td className="py-2 pr-3">{d.assignee?.full_name ?? '—'}</td>
                      <td className="py-2 text-[var(--foreground-muted)]">{[detail.rule_name, detail.team_name].filter(Boolean).join(' / ') || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )

  async function swapPriority(a: Rule, b: Rule | undefined) {
    if (!b) return
    // Equal priorities would leave the order to creation time, so nudge to keep the swap deterministic.
    const pa = b.priority === a.priority ? a.priority + (data.rules.indexOf(b) > data.rules.indexOf(a) ? 1 : -1) : b.priority
    if (await run('PATCH', `/api/routing/rules/${a.id}`, { orgId, priority: Math.max(0, pa) })) {
      await run('PATCH', `/api/routing/rules/${b.id}`, { orgId, priority: a.priority })
    }
  }
}

function describeConditions(rule: Rule, projects: { id: string; name: string }[]): string {
  const parts: string[] = []
  if (rule.match_project_ids.length) {
    const names = rule.match_project_ids.map((id) => projects.find((p) => p.id === id)?.name ?? 'removed project')
    parts.push(`project is ${names.join(' or ')}`)
  }
  if (rule.match_sources.length) parts.push(`source is ${rule.match_sources.map((s) => SOURCE_LABELS[s as keyof typeof SOURCE_LABELS] ?? s).join(' or ')}`)
  if (rule.match_campaign_ids.length) parts.push(`campaign is one of ${rule.match_campaign_ids.length}`)
  if (rule.match_form_ids.length) parts.push(`form is one of ${rule.match_form_ids.length}`)
  if (rule.match_connection_ids.length) parts.push(`from ${rule.match_connection_ids.length} connected account(s)`)
  return parts.length ? `When ${parts.join(' and ')}` : 'Every lead'
}

function TeamCard({ team, orgId, members, busy, run, q }: {
  team: Team
  orgId: string
  members: RoutingPageData['members']
  busy: boolean
  run: (method: string, url: string, body?: unknown) => Promise<boolean>
  q: string
}) {
  const [adding, setAdding] = useState('')
  const inTeam = new Set(team.team_members.map((m) => m.profile_id))
  const candidates = members.filter((m) => !inTeam.has(m.profileId))
  const base = `/api/routing/teams/${team.id}`
  const save = (m: Team['team_members'][number], patch: Partial<{ weight: number; dailyCapacity: number | null; isOnDuty: boolean }>) =>
    run('PUT', `${base}/members`, {
      orgId, profileId: m.profile_id, weight: m.weight, dailyCapacity: m.daily_capacity, isOnDuty: m.is_on_duty, ...patch,
    })

  return (
    <div className="border border-[var(--border)] rounded-lg">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)] bg-surface-muted/60 rounded-t-lg">
        <div className="text-[13px] font-semibold text-[var(--foreground)]">
          {team.name}
          {!team.is_active && <span className="ml-2 text-[11px] font-normal text-[var(--foreground-muted)]">(inactive — gets no leads)</span>}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className={btnGhost} disabled={busy}
            onClick={() => run('PATCH', base, { orgId, isActive: !team.is_active })}>
            {team.is_active ? 'Deactivate' : 'Activate'}
          </button>
          <button type="button" className={`${btn} text-danger border-danger/30 hover:bg-danger-bg`} disabled={busy}
            aria-label={`Delete team ${team.name}`}
            onClick={() => { if (confirm(`Delete team “${team.name}”? Rules that use it must be removed first.`)) run('DELETE', `${base}?${q}`) }}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {team.team_members.length === 0 ? (
        <p className="px-3 py-3 text-[12px] text-[var(--foreground-muted)]">No members. Add salespeople below.</p>
      ) : (
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-[var(--foreground-muted)]">
              <th className="px-3 py-2 font-medium">Member</th>
              <th className="px-3 py-2 font-medium" title="A member with weight 2 gets twice as many leads as weight 1">Share</th>
              <th className="px-3 py-2 font-medium" title="Maximum new leads per day; empty means no limit">Daily limit</th>
              <th className="px-3 py-2 font-medium">On duty</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {team.team_members.map((m) => (
              <tr key={m.id} className="border-t border-[var(--border)]">
                <td className="px-3 py-2 font-medium text-[var(--foreground)]">{m.profile?.full_name ?? 'Unknown'}</td>
                <td className="px-3 py-2">
                  <select className={input} value={m.weight} disabled={busy} aria-label={`Lead share for ${m.profile?.full_name ?? 'member'}`}
                    onChange={(e) => save(m, { weight: Number(e.target.value) })}>
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((w) => <option key={w} value={w}>{w}×</option>)}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input type="number" min={1} max={1000} className={`${input} w-20`} defaultValue={m.daily_capacity ?? ''} placeholder="No limit"
                    disabled={busy} aria-label={`Daily limit for ${m.profile?.full_name ?? 'member'}`}
                    onBlur={(e) => {
                      const v = e.target.value.trim() === '' ? null : Number(e.target.value)
                      if (v !== m.daily_capacity && (v === null || (Number.isInteger(v) && v > 0))) save(m, { dailyCapacity: v })
                    }} />
                </td>
                <td className="px-3 py-2">
                  <input type="checkbox" checked={m.is_on_duty} disabled={busy} aria-label={`${m.profile?.full_name ?? 'Member'} on duty`}
                    onChange={(e) => save(m, { isOnDuty: e.target.checked })} />
                </td>
                <td className="px-3 py-2 text-right">
                  <button type="button" className="text-[12px] text-danger hover:underline disabled:opacity-50" disabled={busy}
                    onClick={() => run('DELETE', `${base}/members?${q}&profileId=${encodeURIComponent(m.profile_id)}`)}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {candidates.length > 0 && (
        <form className="flex items-center gap-2 px-3 py-2 border-t border-[var(--border)]"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!adding) return
            if (await run('PUT', `${base}/members`, { orgId, profileId: adding, weight: 1, dailyCapacity: null, isOnDuty: true })) setAdding('')
          }}>
          <select className={input} value={adding} onChange={(e) => setAdding(e.target.value)} aria-label={`Add member to ${team.name}`}>
            <option value="">Add a member…</option>
            {candidates.map((c) => <option key={c.profileId} value={c.profileId}>{c.name} ({c.role.replace('_', ' ')})</option>)}
          </select>
          <button type="submit" className={btnGhost} disabled={busy || !adding}>Add</button>
        </form>
      )}
    </div>
  )
}

function RuleForm({ rule, orgId, teams, projects, nextPriority, busy, onCancel, onSave }: {
  rule: Rule | null
  orgId: string
  teams: Team[]
  projects: { id: string; name: string }[]
  nextPriority: number
  busy: boolean
  onCancel: () => void
  onSave: (body: Record<string, unknown>, ruleId?: string) => void
}) {
  const [name, setName] = useState(rule?.name ?? '')
  const [teamId, setTeamId] = useState(rule?.team_id ?? teams[0]?.id ?? '')
  const [strategy, setStrategy] = useState(rule?.strategy ?? 'round_robin')
  const [stickyDays, setStickyDays] = useState(rule?.sticky_days ?? 90)
  const [projectIds, setProjectIds] = useState<string[]>(rule?.match_project_ids ?? [])
  const [sources, setSources] = useState<string[]>(rule?.match_sources ?? [])
  const [campaigns, setCampaigns] = useState((rule?.match_campaign_ids ?? []).join(', '))
  const [forms, setForms] = useState((rule?.match_form_ids ?? []).join(', '))

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  return (
    <form
      className="mb-4 p-4 border border-brand/30 bg-brand-light/30 rounded-lg space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        const body: Record<string, unknown> = {
          orgId, name: name.trim(), teamId, strategy, stickyDays,
          matchProjectIds: projectIds, matchSources: sources,
          matchCampaignIds: splitIds(campaigns), matchFormIds: splitIds(forms),
        }
        if (!rule) body.priority = nextPriority
        onSave(body, rule?.id)
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="text-[12px] font-medium text-[var(--foreground)] flex flex-col gap-1">
          Rule name
          <input className={input} required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Skyline Towers — Meta leads" />
        </label>
        <label className="text-[12px] font-medium text-[var(--foreground)] flex flex-col gap-1">
          Send to team
          <select className={input} value={teamId} onChange={(e) => setTeamId(e.target.value)} required>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}{t.is_active ? '' : ' (inactive)'}</option>)}
          </select>
        </label>
        <label className="text-[12px] font-medium text-[var(--foreground)] flex flex-col gap-1">
          How to pick the person
          <select className={input} value={strategy} onChange={(e) => setStrategy(e.target.value as typeof strategy)}>
            <option value="round_robin">Take turns (respects each person&apos;s share)</option>
            <option value="least_open">Whoever has the fewest open leads</option>
          </select>
        </label>
        <label className="text-[12px] font-medium text-[var(--foreground)] flex flex-col gap-1">
          Returning buyers go back to the same person for (days, 0 = off)
          <input type="number" min={0} max={365} className={input} value={stickyDays} onChange={(e) => setStickyDays(Math.max(0, Math.min(365, Number(e.target.value) || 0)))} />
        </label>
      </div>

      <fieldset>
        <legend className="text-[12px] font-medium text-[var(--foreground)] mb-1">Only for these projects (none ticked = any project)</legend>
        {projects.length === 0 ? <p className="text-[12px] text-[var(--foreground-muted)]">No projects yet.</p> : (
          <div className="flex flex-wrap gap-2">
            {projects.map((p) => (
              <label key={p.id} className="text-[12px] flex items-center gap-1.5 px-2 py-1 border border-[var(--border)] rounded-lg bg-[var(--surface)]">
                <input type="checkbox" checked={projectIds.includes(p.id)} onChange={() => toggle(projectIds, setProjectIds, p.id)} /> {p.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend className="text-[12px] font-medium text-[var(--foreground)] mb-1">Only for these sources (none ticked = any source)</legend>
        <div className="flex flex-wrap gap-2">
          {LEAD_SOURCES.map((s) => (
            <label key={s} className="text-[12px] flex items-center gap-1.5 px-2 py-1 border border-[var(--border)] rounded-lg bg-[var(--surface)]">
              <input type="checkbox" checked={sources.includes(s)} onChange={() => toggle(sources, setSources, s)} /> {SOURCE_LABELS[s]}
            </label>
          ))}
        </div>
      </fieldset>

      <details className="text-[12px]">
        <summary className="cursor-pointer text-[var(--foreground-muted)]">Advanced: match specific ad campaigns or forms</summary>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
          <label className="font-medium text-[var(--foreground)] flex flex-col gap-1">
            Campaign IDs (comma separated)
            <input className={input} value={campaigns} onChange={(e) => setCampaigns(e.target.value)} />
          </label>
          <label className="font-medium text-[var(--foreground)] flex flex-col gap-1">
            Form IDs (comma separated)
            <input className={input} value={forms} onChange={(e) => setForms(e.target.value)} />
          </label>
        </div>
      </details>

      <div className="flex items-center gap-2">
        <button type="submit" className={btnPrimary} disabled={busy || !name.trim() || !teamId}>{rule ? 'Save rule' : 'Create rule'}</button>
        <button type="button" className={btnGhost} onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  )
}
