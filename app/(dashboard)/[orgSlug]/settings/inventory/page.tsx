// app/(dashboard)/[orgSlug]/settings/inventory/page.tsx — Properties and deals → Inventory settings: how long a unit
// stays on hold before it is released automatically, the area units new units start with (20260074), and what the
// workspace calls each unit status (names only; the statuses and their rules are fixed). Owners and admins.
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getWorkspaceSettings } from '@/lib/dal/workspace-settings'
import { SettingsCard, SettingsHeader } from '@/components/settings/SettingsSection'
import { InventorySettingsForm } from '@/components/settings/WorkspaceSettingsForms'

export const metadata: Metadata = { title: 'Inventory settings · Settings' }
export const dynamic = 'force-dynamic'

export default async function InventorySettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { org, isAdmin } = await getVerifiedWorkspace(orgSlug)
  if (!isAdmin) redirect(`/${orgSlug}/settings`)
  const settings = await getWorkspaceSettings(org.id)
  return (
    <div className="max-w-3xl space-y-4">
      <SettingsHeader title="Inventory settings" scope="org" description="Rules for units across all your projects." />
      <SettingsCard title="Holds, area units and status names" description="A hold reserves a unit for a buyer for a while, without booking it.">
        <InventorySettingsForm orgId={org.id} initial={settings.inventory} />
      </SettingsCard>
    </div>
  )
}
