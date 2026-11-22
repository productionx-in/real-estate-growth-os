// app/(dashboard)/[orgSlug]/settings/alerts/page.tsx — Your team → Notification defaults: which alerts reach people's
// devices unless they choose otherwise (20260076). Owners and admins.
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getWorkspaceSettings } from '@/lib/dal/workspace-settings'
import { SettingsCard, SettingsHeader } from '@/components/settings/SettingsSection'
import { TeamAlertDefaults } from '@/components/notifications/AlertPreferences'

export const metadata: Metadata = { title: 'Notification defaults · Settings' }
export const dynamic = 'force-dynamic'

export default async function AlertDefaultsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { org, isAdmin } = await getVerifiedWorkspace(orgSlug)
  if (!isAdmin) redirect(`/${orgSlug}/settings`)
  const settings = await getWorkspaceSettings(org.id)
  return (
    <div className="max-w-3xl space-y-4">
      <SettingsHeader title="Notification defaults" scope="org" description="Which alerts reach your team’s phones and computers. Each person can still change their own in My notifications." />
      <SettingsCard title="Alerts on devices" description="Every alert always appears in the person’s inbox in REGrow; these switch the phone or desktop alert on or off.">
        <TeamAlertDefaults orgId={org.id} initial={settings.notifications} />
      </SettingsCard>
    </div>
  )
}
