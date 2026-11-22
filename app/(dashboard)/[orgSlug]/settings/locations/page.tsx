// app/(dashboard)/[orgSlug]/settings/locations/page.tsx — Leads and forms → Locations: the localities and cities the
// workspace sells in, offered as one-tap choices when recording what a buyer wants (20260075). Owners and admins.
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getWorkspaceSettings } from '@/lib/dal/workspace-settings'
import { createServiceClient } from '@/lib/supabase/server'
import { SettingsCard, SettingsHeader } from '@/components/settings/SettingsSection'
import { LocationsForm } from '@/components/settings/FieldsAndListsForms'

export const metadata: Metadata = { title: 'Locations · Settings' }
export const dynamic = 'force-dynamic'

export default async function LocationsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { org, isAdmin } = await getVerifiedWorkspace(orgSlug)
  if (!isAdmin) redirect(`/${orgSlug}/settings`)
  const [settings, { data: projects }] = await Promise.all([
    getWorkspaceSettings(org.id),
    createServiceClient().from('projects').select('location, city').eq('org_id', org.id).limit(500),
  ])
  // Suggest the localities and cities the workspace's projects are in.
  const suggestions = [...new Set((projects ?? []).flatMap((p) => [p.location, p.city]).map((v) => (v ?? '').trim()).filter((v) => v.length >= 2 && v.length <= 60))].sort()
  return (
    <div className="max-w-3xl space-y-4">
      <SettingsHeader title="Locations" scope="org" description="Where your buyers look. Offered as one-tap choices on a lead’s requirements, so everyone spells them the same way and matching works." />
      <SettingsCard title="Localities and cities">
        <LocationsForm orgId={org.id} initial={settings.lists.locations} suggestions={suggestions} />
      </SettingsCard>
    </div>
  )
}
