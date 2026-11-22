// app/(dashboard)/[orgSlug]/settings/matching/page.tsx — Properties and deals → Matching rules: how strictly units are
// matched to buyers (20260077). Owners and admins.
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getWorkspaceSettings } from '@/lib/dal/workspace-settings'
import { SettingsCard, SettingsHeader } from '@/components/settings/SettingsSection'
import { MatchingSettingsForm } from '@/components/settings/VisitMatchingForms'

export const metadata: Metadata = { title: 'Matching rules · Settings' }
export const dynamic = 'force-dynamic'

export default async function MatchingSettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { org, isAdmin } = await getVerifiedWorkspace(orgSlug)
  if (!isAdmin) redirect(`/${orgSlug}/settings`)
  const settings = await getWorkspaceSettings(org.id)
  return (
    <div className="max-w-4xl space-y-4">
      <SettingsHeader title="Matching rules" scope="org" description="How REGrow picks “Matching units” on a lead and “Interested buyers” on a unit. Wrong property type or configuration is never suggested." />
      <SettingsCard title="Rules">
        <MatchingSettingsForm orgId={org.id} initial={settings.matching} />
      </SettingsCard>
    </div>
  )
}
