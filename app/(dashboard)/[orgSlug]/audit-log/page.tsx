// app/(dashboard)/[orgSlug]/audit-log/page.tsx
// Audit log: who changed access, configuration and data in this workspace. Owners and admins only.
// Entries are append-only in the database; this page reads them on the server after checking the role.
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageShell } from '@/components/layout/PageShell'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { AUDIT_AREAS, describeAuditAction, listOrgAudit, type AuditArea, type OrgAuditRow } from '@/lib/dal/org-audit'

export const metadata: Metadata = { title: 'Audit log' }
export const dynamic = 'force-dynamic'

const ACTOR_KIND: Record<OrgAuditRow['actor_kind'], string> = {
  member: '',
  platform: 'REGrow staff',
  support: 'REGrow support',
  system: 'Automatic',
}

const ROLE: Record<string, string> = {
  owner: 'Owner', admin: 'Admin', manager: 'Manager', sales_exec: 'Sales executive', readonly: 'Read-only',
}

function detail(row: OrgAuditRow): string {
  const m = row.metadata ?? {}
  const s = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '')
  switch (row.action) {
    case 'member.role_changed':
      return `${ROLE[s(m.from)] ?? s(m.from)} → ${ROLE[s(m.to)] ?? s(m.to)}`
    case 'member.deactivated':
      return [m.leads_reassigned ? `${s(m.leads_reassigned)} open leads ${m.reassignment === 'reassign_to_member' ? 'reassigned' : 'unassigned'}` : '', m.sessions_revoked ? 'signed out' : '']
        .filter(Boolean).join(' · ')
    case 'invitation.created':
      return `${s(m.email)} as ${ROLE[s(m.role)] ?? s(m.role)}`
    case 'invitation.accepted':
      return `as ${ROLE[s(m.role)] ?? s(m.role)}`
    case 'lead.imported':
      return `${s(m.imported)} leads`
    case 'lead.exported':
      return `${s(m.rows)} rows${m.scope === 'own' ? ' (own leads)' : ''}`
    case 'integration.connected':
      return [s(m.provider), s(m.name)].filter(Boolean).join(' · ')
    case 'project.deleted':
      return s(m.name)
    case 'module.enabled':
    case 'module.disabled':
      return `${s(m.module)} · ${s(m.reason)}`
    case 'support.access_requested':
      return `${s(m.duration_minutes)} min · ${s(m.reason)}`
    case 'support.emergency_access':
      return s(m.reason)
    case 'support.access_approved':
    case 'support.access_denied':
    case 'support.access_revoked':
    case 'support.access_cancelled':
      return s(m.requested_by)
    case 'organisation.lifecycle_changed':
      return `${s(m.from)} → ${s(m.to)}${m.reason ? ` · ${s(m.reason)}` : ''}`
    default:
      return ''
  }
}

const when = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(iso))

export default async function AuditLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ area?: string; before?: string }>
}) {
  const { orgSlug } = await params
  const { area: rawArea, before } = await searchParams
  const { org, isAdmin } = await getVerifiedWorkspace(orgSlug)
  if (!isAdmin) redirect(`/${orgSlug}`)

  const area = rawArea && rawArea in AUDIT_AREAS ? (rawArea as AuditArea) : undefined
  const { rows, nextBefore } = await listOrgAudit(org.id, { area, before })
  const href = (a?: AuditArea, b?: string) => {
    const q = new URLSearchParams()
    if (a) q.set('area', a)
    if (b) q.set('before', b)
    const qs = q.toString()
    return `/${orgSlug}/audit-log${qs ? `?${qs}` : ''}`
  }

  return (
    <PageShell title="Audit log" description="Who changed access, settings and data in this workspace. Entries cannot be edited or deleted.">
      <div className="max-w-6xl space-y-4">
        <nav aria-label="Filter by area" className="flex flex-wrap gap-1.5 text-[12px]">
          <Link href={href()} aria-current={!area ? 'page' : undefined}
            className={`px-3 py-1.5 rounded-full border ${!area ? 'border-[var(--brand)] bg-[var(--brand)] text-brand-foreground' : 'border-[var(--border)] text-[var(--foreground-muted)] hover:bg-[var(--surface-hover)]'}`}>
            All
          </Link>
          {(Object.keys(AUDIT_AREAS) as AuditArea[]).map((a) => (
            <Link key={a} href={href(a)} aria-current={a === area ? 'page' : undefined}
              className={`px-3 py-1.5 rounded-full border ${a === area ? 'border-[var(--brand)] bg-[var(--brand)] text-brand-foreground' : 'border-[var(--border)] text-[var(--foreground-muted)] hover:bg-[var(--surface-hover)]'}`}>
              {AUDIT_AREAS[a]}
            </Link>
          ))}
        </nav>

        <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl" aria-label="Audit entries">
          {rows.length === 0 ? (
            <p className="p-6 text-[13px] text-[var(--foreground-muted)]">
              {before ? 'No older entries.' : 'Nothing recorded yet. Changes to team members, invitations, routing, integrations, imports and exports will appear here.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] min-w-[720px]">
                <thead>
                  <tr className="text-left text-[var(--foreground-muted)] border-b border-[var(--border)]">
                    <th scope="col" className="py-2.5 px-4 font-medium">When</th>
                    <th scope="col" className="py-2.5 px-3 font-medium">Who</th>
                    <th scope="col" className="py-2.5 px-3 font-medium">What</th>
                    <th scope="col" className="py-2.5 px-3 font-medium">Details</th>
                    <th scope="col" className="py-2.5 px-4 font-medium">From</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-[var(--border)] last:border-0 align-top">
                      <td className="py-2.5 px-4 whitespace-nowrap tabular-nums text-[var(--foreground-muted)]">
                        <time dateTime={r.created_at}>{when(r.created_at)}</time>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-medium">{r.actor_label ?? 'Unknown'}</span>
                        {ACTOR_KIND[r.actor_kind] && (
                          <span className="ml-1.5 inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold bg-warning-bg text-warning border border-warning/30">
                            {ACTOR_KIND[r.actor_kind]}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">{describeAuditAction(r.action)}</td>
                      <td className="py-2.5 px-3 text-[var(--foreground-muted)]">{detail(r) || '—'}</td>
                      <td className="py-2.5 px-4 text-[var(--foreground-subtle)] tabular-nums">{r.ip_address ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="flex gap-2 text-[12px]">
          {before && (
            <Link href={href(area)} className="px-3 py-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-hover)]">
              Newest
            </Link>
          )}
          {nextBefore && (
            <Link href={href(area, nextBefore)} className="px-3 py-1.5 rounded-lg border border-[var(--border)] hover:bg-[var(--surface-hover)]">
              Older entries
            </Link>
          )}
        </div>
      </div>
    </PageShell>
  )
}
