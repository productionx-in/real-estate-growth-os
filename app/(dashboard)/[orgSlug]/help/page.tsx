// app/(dashboard)/[orgSlug]/help/page.tsx — Help & support: open a case with RE by PX and follow it. Every member can
// open cases; owners and admins see all of the organisation's cases, others only their own. Staff internal notes are
// never shown. Opening a case does not give RE by PX access to your records: that needs your separate, time-limited
// approval under Support access.
import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { createServiceClient } from '@/lib/supabase/server'
import { getOrgCase, listOrgCases, type Db } from '@/lib/platform/portal'
import { HelpClient } from '@/components/help/HelpClient'

export const metadata: Metadata = { title: 'Help & support' }
export const dynamic = 'force-dynamic'

export default async function HelpPage({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ case?: string }> }) {
  const { orgSlug } = await params
  const { case: caseId } = await searchParams
  const { org, profile, role } = await getVerifiedWorkspace(orgSlug)
  const db = createServiceClient() as unknown as Db
  const member = { profileId: profile.id, role: role as string }
  const cases = await listOrgCases(db, org.id, member)
  const open = caseId && /^[0-9a-f-]{36}$/.test(caseId) ? await getOrgCase(db, org.id, member, caseId) : null
  return (
    <PageShell title="Help & support" description="Ask the RE by PX team a question or report a problem. We reply here and by email.">
      <HelpClient orgId={org.id} orgSlug={orgSlug} cases={cases} open={open} />
    </PageShell>
  )
}
