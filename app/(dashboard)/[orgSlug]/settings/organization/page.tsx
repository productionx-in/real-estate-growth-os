// app/(dashboard)/[orgSlug]/settings/organization/page.tsx — the organisation's own details. Owners and admins.
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { SettingsCard, SettingsHeader } from '@/components/settings/SettingsSection'

export const metadata: Metadata = { title: 'Organisation · Settings' }
export const dynamic = 'force-dynamic'

const ORG_TYPE: Record<string, { label: string; hint: string }> = {
  developer: { label: 'Developer / builder', hint: 'You build and sell your own projects.' },
  channel_partner: { label: 'Channel partner / agency', hint: 'You sell developers’ projects for commission.' },
}

export default async function OrganizationSettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { org, isAdmin } = await getVerifiedWorkspace(orgSlug)
  if (!isAdmin) redirect(`/${orgSlug}/settings`)
  const type = ORG_TYPE[org.type] ?? { label: org.type, hint: '' }
  const row = (label: string, value: React.ReactNode, hint?: string) => (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[12rem_1fr]">
      <dt className="text-[12px] font-medium text-muted">{label}</dt>
      <dd className="text-[13px] text-foreground">{value}{hint && <span className="block text-[12px] text-muted">{hint}</span>}</dd>
    </div>
  )
  return (
    <div className="max-w-3xl space-y-4">
      <SettingsHeader title="Organisation" scope="org" description="Your workspace’s name, type of business and address." />
      <SettingsCard title="Details">
        <dl className="divide-y divide-[var(--border)]">
          {row('Name', <span className="font-semibold">{org.name}</span>, 'To rename the workspace, contact REGrow support.')}
          {row('Type of business', type.label, type.hint)}
          {row('Workspace address', <span className="font-mono">/{org.slug}</span>)}
          {row('Plan', <span className="capitalize">{org.plan ?? '—'}</span>)}
          {org.created_at && row('Created', new Date(org.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }))}
        </dl>
      </SettingsCard>
    </div>
  )
}
