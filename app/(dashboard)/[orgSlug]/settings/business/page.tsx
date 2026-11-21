// app/(dashboard)/[orgSlug]/settings/business/page.tsx — Your company → Business details for documents: letterhead,
// registrations, signatory and the bank account buyers pay into (20260071). Owners and admins.
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getBusinessProfile } from '@/lib/dal/documents'
import { SettingsCard, SettingsHeader } from '@/components/settings/SettingsSection'
import { BusinessProfileForm } from '@/components/settings/BusinessProfileForm'

export const metadata: Metadata = { title: 'Business details · Settings' }
export const dynamic = 'force-dynamic'

export default async function BusinessDetailsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { org, isAdmin } = await getVerifiedWorkspace(orgSlug)
  if (!isAdmin) redirect(`/${orgSlug}/settings`)
  const profile = await getBusinessProfile(org.id)
  return (
    <div className="max-w-5xl space-y-4">
      <SettingsHeader title="Business details" scope="org" description="Your letterhead on cost sheets, quotations, allotment letters and payment demands." />
      <SettingsCard title="Company, registrations, signature and bank account">
        <BusinessProfileForm orgId={org.id} orgName={org.name} initial={profile} />
      </SettingsCard>
    </div>
  )
}
