// app/(dashboard)/[orgSlug]/partners/page.tsx — channel partner network (PR 1). Owners, admins and managers of a
// developer or an agency. Data is read on the server, shaped per side by lib/dal/partners.ts: a developer sees
// only what agencies registered with it; an agency sees only its own registrations and the projects shared with it.
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { PageShell } from '@/components/layout/PageShell'
import { PartnerNetworkView } from '@/components/partners/PartnerNetworkView'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getPartnerCode, listPartnerships, listRegistrationsForAgency, listRegistrationsForDeveloper, listUnitRequests } from '@/lib/dal/partners'
import { AgencyUnitRequests, DeveloperUnitRequests } from '@/components/partners/UnitRequests'
import { canManagePartnerships, canRegisterOrReview } from '@/lib/partners/rules'
import { createServiceClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Partner network' }
export const dynamic = 'force-dynamic'

export default async function PartnersPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { org, role } = await getVerifiedWorkspace(orgSlug)
  if (!canRegisterOrReview(role)) redirect(`/${orgSlug}`)
  const side = org.type === 'channel_partner' ? 'agency' : 'developer'
  const canManage = canManagePartnerships(role)

  const partnerships = await listPartnerships(org.id)
  if (side === 'developer') {
    const [{ data: projects }, registrations, unitRequests] = await Promise.all([
      createServiceClient().from('projects').select('id, name').eq('org_id', org.id).order('name'),
      listRegistrationsForDeveloper(org.id),
      listUnitRequests(org.id, 'developer'),
    ])
    return (
      <PageShell title="Partner network" description="Agencies you work with, the projects you share with them, and the buyers they register.">
        <PartnerNetworkView orgId={org.id} orgSlug={orgSlug} side="developer" canManage={canManage} partnerships={partnerships}
          projects={projects ?? []} developerRegistrations={registrations} />
        <div className="mt-6"><DeveloperUnitRequests orgId={org.id} orgSlug={orgSlug} rows={unitRequests} /></div>
      </PageShell>
    )
  }
  const [code, registrations, unitRequests] = await Promise.all([getPartnerCode(org.id), listRegistrationsForAgency(org.id), listUnitRequests(org.id, 'agency')])
  return (
    <PageShell title="Partner network" description="Developers you work with, the projects they share, and the buyers you have registered.">
      <PartnerNetworkView orgId={org.id} orgSlug={orgSlug} side="agency" canManage={canManage} partnerships={partnerships}
        partnerCode={code} agencyRegistrations={registrations} />
      <div className="mt-6"><AgencyUnitRequests orgId={org.id} rows={unitRequests} registrations={registrations} /></div>
    </PageShell>
  )
}
