// app/(dashboard)/[orgSlug]/settings/page.tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { Plug, ArrowRight } from 'lucide-react'
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

        {/* Integration Centre Link */}
        <div className="bg-[var(--surface)] border border-blue-200/80 rounded-xl p-5 shadow-2xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-2xs">
              <Plug className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-[14px] font-bold text-[var(--foreground)]">Integration Centre</h2>
              <p className="text-[12px] text-[var(--foreground-muted)]">
                Connect Meta Lead Ads, manage Facebook Pages, and map forms to your projects.
              </p>
            </div>
          </div>
          <Link
            href={`/${orgSlug}/integrations`}
            className="px-4 py-2 text-[12px] font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors flex items-center gap-1.5"
          >
            Open Integration Centre
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
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
