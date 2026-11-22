// app/(dashboard)/[orgSlug]/settings/archive/page.tsx — Your company → Archive: leads deleted in the last 30 days.
// Owners and admins restore them as they were, or erase them now; after 30 days a daily job erases them.
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { ARCHIVE_DAYS, listArchivedLeads } from '@/lib/dal/archive'
import { SettingsCard, SettingsHeader } from '@/components/settings/SettingsSection'
import { ArchiveTable } from '@/components/settings/ArchiveTable'

export const metadata: Metadata = { title: 'Archive · Settings' }
export const dynamic = 'force-dynamic'

export default async function ArchivePage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { org, isAdmin } = await getVerifiedWorkspace(orgSlug)
  if (!isAdmin) redirect(`/${orgSlug}/settings`)
  const leads = await listArchivedLeads(org.id)
  return (
    <div className="max-w-4xl space-y-4">
      <SettingsHeader title="Archive" scope="org" description={`Deleted leads are kept here for ${ARCHIVE_DAYS} days, then erased for good. Restore anything deleted by mistake.`} />
      <SettingsCard title={`Leads (${leads.length})`} description="A restored lead comes back exactly as it was — owner, timeline, follow-ups and documents — and nobody is alerted again.">
        <ArchiveTable orgId={org.id} orgSlug={orgSlug} leads={leads} />
      </SettingsCard>
    </div>
  )
}
