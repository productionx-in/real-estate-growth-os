// One customer workspace in the console: details, state controls, support access, and — only while a grant
// is live — a read-only diagnostic overview (every view is recorded in the customer's audit log).
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getConsoleAccess } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'
import { getSupportOverview, isGrantLive, listGrantsForOrg, SUPPORT_REQUEST_ROLES } from '@/lib/dal/support-access'
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui'
import { LifecycleControl } from '@/components/platform/LifecycleControl'
import { SupportRequestForm } from '@/components/platform/SupportRequestForm'
import { GrantActions } from '@/components/platform/GrantActions'
import { GrantStatusBadge } from '@/components/platform/GrantStatusBadge'
import { ModuleToggles } from '@/components/platform/ModuleToggles'
import { ProjectAddonControl } from '@/components/platform/ProjectAddonControl'
import { ADDONS, ADDON_LIST_PRICE } from '@/lib/plots/addons'
import { listPlotMapUsage } from '@/lib/plots/addon-usage'
import { DeleteOrg, ExtendTrial, InviteLinkButton, RenameOrg } from '@/components/platform/OrgManage'
import { getModules, MODULES } from '@/lib/auth/entitlements'
import { listWorkspacePeople } from '@/lib/platform/people'
import { PersonControls } from '@/components/platform/PeopleActions'

export const metadata: Metadata = { title: 'Organisation' }

const when = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(iso)) : '—'

/** Outside render: whether an ISO time has passed. */
function isPast(iso: string) { return new Date(iso).getTime() < Date.now() }

export default async function PlatformOrgPage({ params }: { params: Promise<{ orgId: string }> }) {
  const access = await getConsoleAccess()
  if (access.state !== 'ok') return null
  const { orgId } = await params
  if (!/^[0-9a-f-]{36}$/i.test(orgId)) notFound()

  const service = createServiceClient()
  const { data: org } = await service
    .from('organisations')
    .select('id, name, slug, type, plan, lifecycle_state, lifecycle_reason, lifecycle_changed_at, created_at')
    .eq('id', orgId)
    .maybeSingle()
  if (!org) notFound()
  const { count: members } = await service.from('org_members').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'active')
  const { data: sub } = await service.from('org_subscriptions').select('status, current_period_end').eq('org_id', orgId).maybeSingle()

  const grants = await listGrantsForOrg(orgId, 20)
  const modules = await getModules(orgId)
  const plotMaps = await listPlotMapUsage({ orgId, includeAllProjects: true })
  const isSupport = (SUPPORT_REQUEST_ROLES as readonly string[]).includes(access.role)
  const isSuper = access.role === 'super_admin'
  const canPeople = isSuper || access.role === 'platform_admin'
  const people = canPeople ? await listWorkspacePeople(orgId) : []
  type PendingInvite = { id: string; email: string; role: string; delivery_status: string | null; expires_at: string; expired?: boolean }
  const pendingInvites: PendingInvite[] = isSuper
    ? (((await (service as unknown as { from: (t: string) => any }).from('org_invitations') // eslint-disable-line @typescript-eslint/no-explicit-any
      .select('id, email, role, delivery_status, expires_at').eq('org_id', orgId).eq('status', 'pending').order('created_at', { ascending: false })).data ?? []) as PendingInvite[])
      .map((i) => ({ ...i, expired: isPast(i.expires_at) }))
    : []
  const mine = grants.filter((g) => g.requested_by === access.userId)
  const myLive = mine.find((g) => isGrantLive(g))
  const myPending = mine.find((g) => g.status === 'pending')
  const overview = myLive ? await getSupportOverview(orgId, { userId: access.userId, label: `${access.label} (RE by PX support)` }) : null

  return (
    <div className="space-y-5">
      <div>
        <Link href="/platform/organisations" className="text-[12px] text-muted hover:text-foreground">← Organisations</Link>
        <h1 className="mt-1 text-[22px] font-semibold tracking-tight">{org.name}</h1>
        <p className="text-[13px] text-muted">
          {org.slug} · {org.type === 'channel_partner' ? 'Channel partner' : 'Developer'} · plan {org.plan ?? '—'} · {members ?? 0} active {members === 1 ? 'member' : 'members'} · since {when(org.created_at)}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Workspace state</CardTitle>
              <CardDescription>Currently <strong>{org.lifecycle_state}</strong>{org.lifecycle_reason ? ` — ${org.lifecycle_reason}` : ''} · {when(org.lifecycle_changed_at)}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {isSuper ? <LifecycleControl orgId={org.id} current={org.lifecycle_state} />
              : <p className="text-[13px] text-muted">Only a super admin can change a workspace’s state.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Support access</CardTitle>
              <CardDescription>Read-only, time-limited, approved by the customer’s owner or admin. No impersonation.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!isSupport && <p className="text-[13px] text-muted">Only support staff and super admins can request access.</p>}
            {isSupport && myLive && <Alert tone="success" title="You have access">Until {when(myLive.expires_at)}. Every view is recorded in the customer’s audit log.</Alert>}
            {isSupport && myPending && <Alert tone="warning" title="Waiting for the customer">Their owners and admins see your request on their Support access page.</Alert>}
            {isSupport && !myLive && !myPending && <SupportRequestForm orgId={org.id} />}
          </CardContent>
        </Card>
      </div>

      {(isSuper || access.role === 'platform_admin' || (access.role === 'finance_admin' && sub?.status === 'trial')) && (
        <div className="grid gap-5 lg:grid-cols-2">
          {(isSuper || access.role === 'platform_admin') && (
            <Card>
              <CardHeader><div><CardTitle>Details</CardTitle><CardDescription>Change how this customer appears in RE by PX.</CardDescription></div></CardHeader>
              <CardContent><RenameOrg orgId={org.id} name={org.name} /></CardContent>
            </Card>
          )}
          {(isSuper || access.role === 'finance_admin') && sub?.status === 'trial' && (
            <Card>
              <CardHeader><div><CardTitle>Trial</CardTitle><CardDescription>Give a customer more time to evaluate. Recorded in the audit log.</CardDescription></div></CardHeader>
              <CardContent><ExtendTrial orgId={org.id} endsAt={sub.current_period_end} /></CardContent>
            </Card>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Modules</CardTitle>
            <CardDescription>Leads, projects, team, settings and the audit log are always included.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <ModuleToggles orgId={org.id} modules={modules} labels={{ ...MODULES }} canEdit={access.role === 'super_admin' || access.role === 'platform_admin'} />
        </CardContent>
      </Card>

      <Card id="plot-map-addon" className="scroll-mt-20">
        <CardHeader>
          <div>
            <CardTitle>{ADDONS.plot_maps.name}</CardTitle>
            <CardDescription>Paid add-on, activated per project. Off unless activated here. The customer manages their own layouts in the workspace; only counts are shown.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="divide-y divide-[var(--border)]">
          {plotMaps.length === 0 ? <p className="text-[13px] text-muted">This workspace has no projects yet.</p> : plotMaps.map((u) => (
            <ProjectAddonControl key={u.projectId} orgId={org.id} projectId={u.projectId} projectName={u.projectName} addon={u.addon}
              canEdit={isSuper} suggested={ADDON_LIST_PRICE.plot_maps} usage={u} />
          ))}
        </CardContent>
      </Card>

      {overview && (overview.ok ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Diagnostic overview {overview.data.grant.emergency && <Badge tone="danger" className="ml-1">Emergency</Badge>}</CardTitle>
              <CardDescription>Shown under grant until {when(overview.data.grant.expires_at)}. Lead names, phone numbers, emails and credentials are never shown here.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-3 text-[13px]">
            <section aria-label="Team">
              <h3 className="mb-2 font-semibold">Team</h3>
              <ul className="space-y-1">
                {overview.data.members.map((m, i) => (
                  <li key={i} className="flex justify-between gap-2"><span>{m.full_name}</span><span className="text-muted">{m.role}{m.status !== 'active' ? ` · ${m.status}` : ''}</span></li>
                ))}
              </ul>
            </section>
            <section aria-label="Leads in the last 30 days">
              <h3 className="mb-2 font-semibold">Leads, last 30 days</h3>
              {Object.keys(overview.data.leadsByStatus).length === 0 ? <p className="text-muted">None</p> : (
                <ul className="space-y-1">
                  {Object.entries(overview.data.leadsByStatus).sort((a, b) => b[1] - a[1]).map(([s, n]) => (
                    <li key={s} className="flex justify-between"><span>{s.replace(/_/g, ' ')}</span><span className="tabular-nums">{n}</span></li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-label="Integrations">
              <h3 className="mb-2 font-semibold">Integrations</h3>
              {overview.data.integrations.length === 0 ? <p className="text-muted">None connected</p> : (
                <ul className="space-y-2">
                  {overview.data.integrations.map((c, i) => (
                    <li key={i}>
                      <div className="flex justify-between gap-2"><span>{c.name}</span><Badge tone={c.status === 'active' ? 'success' : 'warning'}>{c.status}</Badge></div>
                      <p className="text-[12px] text-subtle">{c.provider} · last sync {when(c.last_sync_at)}</p>
                      {c.last_error && <p className="text-[12px] text-danger">{c.last_error}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </CardContent>
        </Card>
      ) : <Alert tone="danger">{overview.error}</Alert>)}

      <Card>
        <CardHeader><CardTitle>Support access history</CardTitle></CardHeader>
        <CardContent className="p-0">
          {grants.length === 0 ? <p className="px-4 pb-4 text-[13px] text-muted">No requests yet.</p> : (
            <ul className="divide-y divide-[var(--border)]">
              {grants.map((g) => (
                <li key={g.id} className="space-y-1.5 px-4 py-3 text-[13px]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{g.requested_by_label}</span>
                    <GrantStatusBadge grant={g} />
                  </div>
                  <p className="text-muted">{g.reason}</p>
                  <p className="text-[12px] text-subtle">Requested {when(g.created_at)} · {g.duration_minutes} min{g.expires_at ? ` · until ${when(g.expires_at)}` : ''}{g.decision_note ? ` · note: ${g.decision_note}` : ''}</p>
                  {(g.status === 'pending' || isGrantLive(g)) && (
                    <GrantActions grantId={g.id} status={g.status}
                      canEnd={g.requested_by === access.userId || isSuper} canEmergency={isSuper} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {isSuper && pendingInvites.length > 0 && (
        <Card className="border-warning/40">
          <CardHeader>
            <div>
              <CardTitle>Waiting to join</CardTitle>
              <CardDescription>These people were invited but haven’t set up their account yet. Get a link and send it to them yourself — for example on WhatsApp.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {pendingInvites.map((i) => (
              <div key={i.id} className="space-y-2 border-b border-default pb-4 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[13px] font-medium">{i.email}</p>
                  <Badge tone="neutral">{i.role.replace('_', ' ')}</Badge>
                  {i.delivery_status === 'failed' ? <Badge tone="warning">E-mail not sent</Badge> : i.delivery_status === 'delivered' ? <Badge tone="info">E-mailed</Badge> : null}
                  {i.expired && <Badge tone="danger">Link expired</Badge>}
                </div>
                <InviteLinkButton orgId={org.id} invitationId={i.id} email={i.email} orgName={org.name} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {canPeople && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>People</CardTitle>
              <CardDescription>
                Who can use this workspace. Suspend someone’s access here, or {isSuper ? 'block their sign-in to RE by PX altogether' : 'ask the Platform Owner to block their sign-in'}.
                Every change needs a reason and shows in the customer’s audit log.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {people.length === 0 ? (
              <p className="px-5 pb-5 text-[13px] text-muted">Nobody belongs to this workspace yet.</p>
            ) : (
              <ul className="divide-y divide-default">
                {people.map((p) => (
                  <li key={p.memberId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium">{p.name}</p>
                      <p className="truncate text-[12px] text-muted">{p.email} · {p.role.replace('_', ' ')} · last sign-in {p.lastSignIn ? when(p.lastSignIn) : 'never'}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {p.status === 'active' ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Access off ({p.status})</Badge>}
                        {p.blocked && <Badge tone="danger">Sign-in blocked</Badge>}
                      </div>
                    </div>
                    <PersonControls name={p.name} email={p.email} userId={p.userId} staff={p.staff} blocked={p.blocked} isSelf={p.userId === access.userId}
                      canAccount={isSuper} canMember orgId={org.id} memberId={p.memberId} memberStatus={p.status} workspaces={[org.name]} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
      {isSuper && (
        <Card className="border-danger/40">
          <CardHeader><div><CardTitle className="text-danger">Deactivate or delete workspace</CardTitle><CardDescription>Platform Owner only.</CardDescription></div></CardHeader>
          <CardContent><DeleteOrg orgId={org.id} name={org.name} state={org.lifecycle_state} /></CardContent>
        </Card>
      )}
    </div>
  )
}
