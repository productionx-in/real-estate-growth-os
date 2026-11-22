// app/(dashboard)/[orgSlug]/routing/log/page.tsx — the full assignment log: every routing decision, filterable by
// outcome and by person, with last-30-day counts that show where leads fall through (nobody available, no rule).
// Same access as the routing settings (canManageRouting).
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageShell } from '@/components/layout/PageShell'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { canManageRouting } from '@/lib/auth/permissions'
import { listRoutingLog, ROUTING_OUTCOMES, type RoutingOutcome } from '@/lib/dal/routing'
import { createServiceClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils/cn'

export const metadata: Metadata = { title: 'Assignment log' }
export const dynamic = 'force-dynamic'

const TONE: Record<RoutingOutcome, string> = {
  assigned: 'text-success', sticky: 'text-brand', no_matching_rule: 'text-warning', no_available_member: 'text-danger', sla_reassigned: 'text-warning',
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function AssignmentLogPage({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ outcome?: string; person?: string; page?: string }> }) {
  const { orgSlug } = await params
  const sp = await searchParams
  const { org, role } = await getVerifiedWorkspace(orgSlug)
  if (!canManageRouting(role)) redirect(`/${orgSlug}`)
  const outcome = sp.outcome && sp.outcome in ROUTING_OUTCOMES ? (sp.outcome as RoutingOutcome) : null
  const person = sp.person && UUID.test(sp.person) ? sp.person : null
  const page = Math.max(0, Math.min(1000, Number.parseInt(sp.page ?? '0', 10) || 0))
  const [log, { data: members }] = await Promise.all([
    listRoutingLog(org.id, { outcome, assignee: person, page }),
    createServiceClient().from('org_members').select('profile_id, profile:profiles!org_members_profile_id_fkey(full_name)').eq('org_id', org.id).eq('status', 'active'),
  ])
  const href = (o: Partial<{ outcome: string | null; person: string | null; page: number }>) => {
    const q = new URLSearchParams()
    const next = { outcome, person, page: 0, ...o }
    if (next.outcome) q.set('outcome', next.outcome)
    if (next.person) q.set('person', next.person)
    if (next.page) q.set('page', String(next.page))
    return `/${orgSlug}/routing/log${q.size ? `?${q}` : ''}`
  }
  if (!log.success) return <PageShell title="Assignment log"><p className="text-[13px] text-danger">Could not load the log.</p></PageShell>
  const { rows, total, pageSize, last30 } = log.data
  const pages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <PageShell title="Assignment log" description="Every lead the routing rules handled: who got it, and why." actions={<Link href={`/${orgSlug}/routing`} className="text-[13px] font-medium text-brand hover:underline">Routing settings</Link>}>
      <div className="max-w-6xl space-y-4">
        <section aria-label="Last 30 days" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {(Object.keys(ROUTING_OUTCOMES) as RoutingOutcome[]).map((o) => (
            <Link key={o} href={href({ outcome: outcome === o ? null : o })} aria-current={outcome === o ? 'true' : undefined}
              className={cn('rounded-lg border bg-surface p-3 hover:border-brand', outcome === o ? 'border-brand' : 'border-default')}>
              <p className={cn('text-[20px] font-semibold tabular-nums', TONE[o])}>{last30[o]}</p>
              <p className="text-[12px] text-muted">{ROUTING_OUTCOMES[o]} · 30 days</p>
            </Link>
          ))}
        </section>
        {(last30.no_available_member > 0 || last30.no_matching_rule > 0) && (
          <p className="rounded-lg border border-default bg-surface p-3 text-[13px] text-foreground">
            {last30.no_available_member > 0 && <>{last30.no_available_member} lead{last30.no_available_member === 1 ? '' : 's'} found nobody on duty or under their daily limit. </>}
            {last30.no_matching_rule > 0 && <>{last30.no_matching_rule} matched no rule. </>}
            Check duty, daily limits and rules in <Link href={`/${orgSlug}/routing`} className="font-medium text-brand underline">routing settings</Link>.
          </p>
        )}
        <form className="flex flex-wrap items-end gap-2" action={`/${orgSlug}/routing/log`}>
          {outcome && <input type="hidden" name="outcome" value={outcome} />}
          <label className="text-[12px] text-muted">Person
            <select name="person" defaultValue={person ?? ''} className="ml-2 h-9 rounded-md border border-default bg-surface px-2 text-[13px] text-foreground">
              <option value="">Everyone</option>
              {(members ?? []).map((m) => <option key={m.profile_id} value={m.profile_id}>{(m.profile as { full_name?: string } | null)?.full_name ?? 'Team member'}</option>)}
            </select>
          </label>
          <button type="submit" className="h-9 rounded-md border border-default px-3 text-[13px] font-medium text-foreground hover:bg-surface-hover">Filter</button>
          {(outcome || person) && <Link href={href({ outcome: null, person: null })} className="h-9 px-2 text-[13px] leading-9 text-brand">Clear</Link>}
        </form>
        <div className="overflow-x-auto rounded-xl border border-default bg-surface">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead className="bg-surface-muted text-left text-[11px] font-semibold uppercase tracking-wide text-subtle">
              <tr><th className="px-4 py-2.5">When</th><th className="px-4 py-2.5">Lead</th><th className="px-4 py-2.5">Outcome</th><th className="px-4 py-2.5">Assigned to</th><th className="px-4 py-2.5">Rule / team</th></tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {rows.map((d) => {
                const detail = (d.detail ?? {}) as { rule_name?: string; team_name?: string }
                const lead = d.lead as { id: string; name: string } | null
                const o = d.outcome as RoutingOutcome
                return (
                  <tr key={d.id}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted">{new Date(d.decided_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })}</td>
                    <td className="px-4 py-2.5">{lead ? <Link href={`/${orgSlug}/leads/${lead.id}`} className="text-brand hover:underline">{lead.name}</Link> : <span className="text-subtle">Deleted or archived lead</span>}</td>
                    <td className={cn('px-4 py-2.5 font-medium', TONE[o])}>{ROUTING_OUTCOMES[o] ?? d.outcome}</td>
                    <td className="px-4 py-2.5">{(d.assignee as { full_name?: string } | null)?.full_name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-muted">{[detail.rule_name, detail.team_name].filter(Boolean).join(' / ') || '—'}</td>
                  </tr>
                )
              })}
              {!rows.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted">Nothing here yet.</td></tr>}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <nav aria-label="Pages" className="flex items-center justify-between text-[13px]">
            <span className="text-muted">{total.toLocaleString('en-IN')} decisions · page {page + 1} of {pages}</span>
            <span className="flex gap-2">
              {page > 0 && <Link href={href({ page: page - 1 })} className="rounded-md border border-default px-3 py-1.5 hover:bg-surface-hover">Newer</Link>}
              {page + 1 < pages && <Link href={href({ page: page + 1 })} className="rounded-md border border-default px-3 py-1.5 hover:bg-surface-hover">Older</Link>}
            </span>
          </nav>
        )}
      </div>
    </PageShell>
  )
}
