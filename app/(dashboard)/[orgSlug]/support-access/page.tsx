// Support access: owners and admins decide whether RE by PX support may look at this workspace, for how long,
// and can end it at any time. Every request, decision and view is also in the audit log.
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { grantState, isGrantLive, listGrantsForOrg } from '@/lib/dal/support-access'
import { Alert, Card, EmptyState } from '@/components/ui'
import { GrantStatusBadge } from '@/components/platform/GrantStatusBadge'
import { CustomerGrantActions } from '@/components/support/CustomerGrantActions'

export const metadata: Metadata = { title: 'Support access' }
export const dynamic = 'force-dynamic'

const when = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(iso)) : '—'
const duration = (m: number) => (m < 60 ? `${m} minutes` : m === 60 ? '1 hour' : `${m / 60} hours`)

export default async function SupportAccessPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { org, isAdmin } = await getVerifiedWorkspace(orgSlug)
  if (!isAdmin) redirect(`/${orgSlug}`)
  const grants = await listGrantsForOrg(org.id)
  const open = grants.filter((g) => g.status === 'pending' || isGrantLive(g))
  const past = grants.filter((g) => !open.includes(g))

  return (
    <PageShell title="Support access" description="RE by PX support can see your workspace only when you allow it — read-only, for a limited time, and you can end it whenever you like.">
      <div className="max-w-3xl space-y-5">
        <Alert tone="info" title="What support can see">
          Your team, lead counts by status and integration health — enough to diagnose a problem. They cannot change anything, cannot sign in as anyone, and never see passwords or connection secrets. Each view is recorded in your <Link href={`/${orgSlug}/audit-log?area=support`} className="text-brand underline-offset-4 hover:underline">audit log</Link>.
        </Alert>

        <section aria-label="Open requests and active access" className="space-y-3">
          <h2 className="text-[13px] font-semibold">Needs your attention</h2>
          {open.length === 0 ? (
            <Card><EmptyState icon={ShieldCheck} title="Nothing open" description="When RE by PX support asks to look at your workspace, the request appears here for you to approve or deny." /></Card>
          ) : open.map((g) => (
            <Card key={g.id} className="space-y-2 p-4 text-[13px]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{g.requested_by_label}</span>
                <GrantStatusBadge grant={g} />
              </div>
              <p>{g.reason}</p>
              <p className="text-[12px] text-subtle">
                {g.status === 'pending'
                  ? `Asked ${when(g.created_at)} for ${duration(g.duration_minutes)} of read-only access, starting when you approve.`
                  : `Access until ${when(g.expires_at)}.${g.emergency ? ` Granted in an emergency by RE by PX without your approval: ${g.decision_note ?? ''}` : ''}`}
              </p>
              <CustomerGrantActions grantId={g.id} status={g.status === 'pending' ? 'pending' : 'live'} />
            </Card>
          ))}
        </section>

        {past.length > 0 && (
          <section aria-label="History" className="space-y-2">
            <h2 className="text-[13px] font-semibold">History</h2>
            <Card>
              <ul className="divide-y divide-[var(--border)]">
                {past.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 text-[13px]">
                    <div className="min-w-0">
                      <p className="font-medium">{g.requested_by_label}</p>
                      <p className="text-muted">{g.reason}</p>
                      <p className="text-[12px] text-subtle">
                        {when(g.created_at)}{grantState(g) === 'expired' || g.status === 'revoked' ? ` · ended ${when(g.revoked_at ?? g.expires_at)}` : ''}
                      </p>
                    </div>
                    <GrantStatusBadge grant={g} />
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        )}
      </div>
    </PageShell>
  )
}
