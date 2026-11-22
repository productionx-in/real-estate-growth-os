// app/(dashboard)/[orgSlug]/settings/leads/page.tsx — Leads and forms → Lead settings: the reasons offered when a
// lead is closed as Lost or Junk (20260074). Owners and admins.
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getWorkspaceSettings } from '@/lib/dal/workspace-settings'
import { SettingsCard, SettingsHeader } from '@/components/settings/SettingsSection'
import { LeadSettingsForm } from '@/components/settings/WorkspaceSettingsForms'

export const metadata: Metadata = { title: 'Lead settings · Settings' }
export const dynamic = 'force-dynamic'

export default async function LeadSettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { org, isAdmin } = await getVerifiedWorkspace(orgSlug)
  if (!isAdmin) redirect(`/${orgSlug}/settings`)
  const settings = await getWorkspaceSettings(org.id)
  return (
    <div className="max-w-4xl space-y-4">
      <SettingsHeader title="Lead settings" scope="org" description="How your team closes leads, for everyone in the workspace." />
      <SettingsCard title="Reasons for closing a lead" description="Offered when someone marks a lead Lost or Junk, in this order.">
        <LeadSettingsForm orgId={org.id} initial={settings.leads} />
      </SettingsCard>
    </div>
  )
}
