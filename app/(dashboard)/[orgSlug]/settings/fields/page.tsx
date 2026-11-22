// app/(dashboard)/[orgSlug]/settings/fields/page.tsx — Leads and forms → Fields on leads: the workspace's own fields,
// shown on every lead under "More details" and in exports (20260075). Owners and admins.
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getWorkspaceSettings } from '@/lib/dal/workspace-settings'
import { SettingsCard, SettingsHeader } from '@/components/settings/SettingsSection'
import { FieldsSettingsForm } from '@/components/settings/FieldsAndListsForms'

export const metadata: Metadata = { title: 'Fields on leads · Settings' }
export const dynamic = 'force-dynamic'

export default async function FieldsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { org, isAdmin } = await getVerifiedWorkspace(orgSlug)
  if (!isAdmin) redirect(`/${orgSlug}/settings`)
  const settings = await getWorkspaceSettings(org.id)
  return (
    <div className="max-w-4xl space-y-4">
      <SettingsHeader title="Fields on leads" scope="org" description="Record what matters to your business on every lead, beyond name, phone, budget and requirements." />
      <SettingsCard title="Your fields" description="Your team fills these in on a lead’s page; they appear in lead exports. Removing a field hides it but keeps what was recorded.">
        <FieldsSettingsForm orgId={org.id} initial={settings.fields.lead} />
      </SettingsCard>
    </div>
  )
}
