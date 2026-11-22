// app/(dashboard)/[orgSlug]/settings/visits/page.tsx — Leads and forms → Site visits: buyer messages, check-in
// distance and the daily limit per salesperson (20260077). Owners and admins.
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getWorkspaceSettings } from '@/lib/dal/workspace-settings'
import { SettingsCard, SettingsHeader } from '@/components/settings/SettingsSection'
import { VisitSettingsForm } from '@/components/settings/VisitMatchingForms'

export const metadata: Metadata = { title: 'Site visits · Settings' }
export const dynamic = 'force-dynamic'

export default async function VisitSettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { org, isAdmin } = await getVerifiedWorkspace(orgSlug)
  if (!isAdmin) redirect(`/${orgSlug}/settings`)
  const settings = await getWorkspaceSettings(org.id)
  return (
    <div className="max-w-3xl space-y-4">
      <SettingsHeader title="Site visits" scope="org" description="What buyers hear about their visit, and the rules for your team’s calendar." />
      <SettingsCard title="Visits">
        <VisitSettingsForm orgId={org.id} initial={settings.visits} />
      </SettingsCard>
    </div>
  )
}
