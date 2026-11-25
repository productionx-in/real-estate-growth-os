// app/(dashboard)/[orgSlug]/settings/sales/page.tsx — Settings → Sales structure (lib/sales/structure.ts, 20260096):
// whether the owner also works as a salesperson, and whether the workspace is organised into teams. Owners and admins.
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getSalesStructure, openLeadsHeldByOwners } from '@/lib/dal/sales-structure'
import { SettingsCard, SettingsHeader } from '@/components/settings/SettingsSection'
import { SalesStructureForm } from '@/components/settings/SalesStructureForm'

export const metadata: Metadata = { title: 'Sales structure · Settings' }
export const dynamic = 'force-dynamic'

export default async function SalesStructurePage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { org, isAdmin } = await getVerifiedWorkspace(orgSlug)
  if (!isAdmin) redirect(`/${orgSlug}/settings`)
  const [s, ownerOpenLeads] = await Promise.all([getSalesStructure(org.id), openLeadsHeldByOwners(org.id)])
  return (
    <div className="max-w-3xl space-y-4">
      <SettingsHeader title="Sales structure" scope="org" description="How your sales team is organised: who sells, who manages, and whether you work in teams." />
      <SettingsCard title="Roles in selling" description="Owners manage by default. Managers, team leads and sales executives receive leads.">
        <SalesStructureForm orgId={org.id} orgSlug={orgSlug} initial={s} ownerOpenLeads={ownerOpenLeads} />
      </SettingsCard>
    </div>
  )
}
