// app/(dashboard)/[orgSlug]/settings/page.tsx
import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { IntegrationReadinessPanel } from '@/components/integrations/IntegrationReadinessPanel'

export const metadata: Metadata = { title: 'Settings' }
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ orgSlug: string }>
}

const ORG_TYPE_LABEL: Record<string, string> = {
  developer: 'Property Developer / Builder',
  channel_partner: 'Channel Partner / Brokerage',
}

export default async function SettingsPage({ params }: PageProps) {
  const { orgSlug } = await params
  const { user, profile, org, role, isAdmin } = await getVerifiedWorkspace(orgSlug)

  return (
    <PageShell title="Settings" description="Manage your workspace configuration and user profile">
      <div className="max-w-4xl space-y-6">
        {/* Organisation info */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-2xs">
          <h2 className="text-[13px] font-semibold text-[var(--foreground)] mb-4">
            Organisation Details
          </h2>
          <dl className="space-y-3">
            <div className="flex gap-3">
              <dt className="w-28 text-[12px] font-medium text-[var(--foreground-muted)]">Name</dt>
              <dd className="text-[13px] font-semibold text-[var(--foreground)]">{org.name}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-28 text-[12px] font-medium text-[var(--foreground-muted)]">Type</dt>
              <dd className="text-[13px] text-[var(--foreground)]">
                {ORG_TYPE_LABEL[org.type] ?? org.type}
              </dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-28 text-[12px] font-medium text-[var(--foreground-muted)]">Workspace URL</dt>
              <dd className="text-[13px] text-[var(--foreground)] font-mono">/{org.slug}</dd>
            </div>
            <div className="flex gap-3">
              <dt className="w-28 text-[12px] font-medium text-[var(--foreground-muted)]">Plan</dt>
              <dd>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 capitalize border border-blue-200">
                  {org.plan ?? 'growth'}
                </span>
              </dd>
            </div>
          </dl>
          {!isAdmin && (
            <p className="mt-4 text-[12px] text-[var(--foreground-muted)]">
              Only workspace owners and administrators can edit organisation settings.
            </p>
          )}
        </div>

        {/* CRM Integration Readiness & Lead Source Architecture (Stage 3G) */}
        <IntegrationReadinessPanel />

        {/* Profile info */}
        {profile && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-2xs">
            <h2 className="text-[13px] font-semibold text-[var(--foreground)] mb-4">Your Profile</h2>
            <dl className="space-y-3">
              <div className="flex gap-3">
                <dt className="w-28 text-[12px] font-medium text-[var(--foreground-muted)]">Name</dt>
                <dd className="text-[13px] font-semibold text-[var(--foreground)]">
                  {profile.full_name}
                </dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-28 text-[12px] font-medium text-[var(--foreground-muted)]">Email</dt>
                <dd className="text-[13px] text-[var(--foreground)]">{user.email}</dd>
              </div>
              <div className="flex gap-3">
                <dt className="w-28 text-[12px] font-medium text-[var(--foreground-muted)]">Role</dt>
                <dd className="text-[13px] text-[var(--foreground)] capitalize">
                  {role.replace('_', ' ')}
                </dd>
              </div>
              {profile.phone && (
                <div className="flex gap-3">
                  <dt className="w-28 text-[12px] font-medium text-[var(--foreground-muted)]">Phone</dt>
                  <dd className="text-[13px] text-[var(--foreground)]">{profile.phone}</dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </div>
    </PageShell>
  )
}
