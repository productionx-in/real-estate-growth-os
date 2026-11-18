// app/(dashboard)/[orgSlug]/billing/page.tsx — plan, trial, seats and invoices. Owners and admins only
// (the API checks the same); everyone else is sent home.
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { PageShell } from '@/components/layout/PageShell'
import { BillingClient } from '@/components/billing/BillingClient'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getBillingOverview } from '@/lib/dal/billing'
import { canManageBilling } from '@/lib/billing/plans'
import { razorpayConfig } from '@/lib/billing/razorpay'

export const metadata: Metadata = { title: 'Billing' }
export const dynamic = 'force-dynamic'

export default async function BillingPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { org, role } = await getVerifiedWorkspace(orgSlug)
  if (!canManageBilling(role)) redirect(`/${orgSlug}`)
  const overview = await getBillingOverview(org.id)
  return (
    <PageShell title="Plan & billing" description="Your plan, seats and invoices. Prices are in INR; GST at 18% is added to every invoice.">
      <BillingClient orgId={org.id} orgSlug={orgSlug} orgName={org.name} overview={overview} payOnline={!!razorpayConfig()} />
    </PageShell>
  )
}
