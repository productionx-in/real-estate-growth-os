// app/(dashboard)/[orgSlug]/settings/reports/page.tsx — Report settings: when the financial year and the week start,
// which set the calendar periods reports offer (lib/reports/periods.ts, 20260074). Owners and admins.
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getWorkspaceSettings } from '@/lib/dal/workspace-settings'
import { SettingsCard, SettingsHeader } from '@/components/settings/SettingsSection'
import { ReportSettingsForm } from '@/components/settings/WorkspaceSettingsForms'

export const metadata: Metadata = { title: 'Report settings · Settings' }
export const dynamic = 'force-dynamic'

export default async function ReportSettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { org, isAdmin } = await getVerifiedWorkspace(orgSlug)
  if (!isAdmin) redirect(`/${orgSlug}/settings`)
  const settings = await getWorkspaceSettings(org.id)
  return (
    <div className="max-w-3xl space-y-4">
      <SettingsHeader title="Report settings" scope="org" description="How reports count weeks, quarters and years, for everyone in the workspace." />
      <SettingsCard title="Periods" description="Times are India time (IST); a day starts at midnight.">
        <ReportSettingsForm orgId={org.id} initial={settings.reports} />
      </SettingsCard>
    </div>
  )
}
