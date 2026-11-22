// app/(dashboard)/[orgSlug]/settings/listings/page.tsx — Properties and deals → Listing share message (agencies).
// Owners and admins.
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getShareTemplate } from '@/lib/dal/listings'
import { SettingsCard, SettingsHeader } from '@/components/settings/SettingsSection'
import { ShareTemplateForm } from '@/components/listings/ShareTemplateForm'

export const metadata: Metadata = { title: 'Listing share message · Settings' }
export const dynamic = 'force-dynamic'

export default async function ListingShareSettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { org, isAdmin } = await getVerifiedWorkspace(orgSlug)
  if (!isAdmin || org.type !== 'channel_partner') redirect(`/${orgSlug}/settings`)
  return (
    <div className="max-w-5xl space-y-4">
      <SettingsHeader title="Listing share message" scope="org" description="What agents send on WhatsApp when they share a resale or rental listing with a buyer or tenant." />
      <SettingsCard title="Message">
        <ShareTemplateForm orgId={org.id} agency={org.name} initial={await getShareTemplate(org.id)} />
      </SettingsCard>
    </div>
  )
}
