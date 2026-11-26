// app/(dashboard)/[orgSlug]/billing/page.tsx — plan, trial, seats and invoices. Owners and admins only
// (the API checks the same); everyone else is sent home.
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { PageShell } from '@/components/layout/PageShell'
import { BillingClient } from '@/components/billing/BillingClient'
import { BillingProfileForm } from '@/components/billing/BillingProfileForm'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { billingRoleFor } from '@/lib/billing/access'
import { getBillingOverview } from '@/lib/dal/billing'
import { createServiceClient } from '@/lib/supabase/server'
import { envResolver, primaryAdapter } from '@/lib/payments/registry'
import { getModules, MODULES, type ModuleKey } from '@/lib/auth/entitlements'
import { CheckCircle2, Lock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui'

export const metadata: Metadata = { title: 'Billing' }
export const dynamic = 'force-dynamic'

export default async function BillingPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { org, profile } = await getVerifiedWorkspace(orgSlug)
  // Owners/admins; also while the workspace is on a billing hold (their real role is kept aside), so they can pay.
  if (!(await billingRoleFor(org.id, profile.id))) redirect(`/${orgSlug}`)
  const [overview, modules] = await Promise.all([getBillingOverview(org.id), getModules(org.id)])
  // Online payment is offered only when the primary gateway (set by the Platform Owner) is enabled and configured.
  const service = createServiceClient()
  const primary = await primaryAdapter(service, envResolver())
  const untyped = service as unknown as { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
  const [{ data: bp }, { data: settings }] = await Promise.all([
    untyped.from('org_billing_profiles').select('legal_name, gstin, state_code, billing_address').eq('org_id', org.id).maybeSingle(),
    untyped.from('billing_settings').select('gst_rate_bps').maybeSingle(),
  ])
  const rate = settings?.gst_rate_bps != null ? `GST at ${settings.gst_rate_bps / 100}% is added to every invoice.` : 'GST is added as applicable.'
  return (
    <PageShell title="Plan & billing" description={`Your plan, seats and invoices. Prices are in INR; ${rate}`}>
      <div className="space-y-6">
        <BillingClient orgId={org.id} orgSlug={orgSlug} orgName={org.name} overview={overview} payOnline={!!primary.adapter} />
        <Card>
          <CardHeader>
            <CardTitle>What’s included</CardTitle>
            <p className="text-[12px] text-muted">{org.type === 'channel_partner' ? 'Channel partner agency' : 'Developer'} workspace. Leads, follow-ups, team and settings are always included; these modules depend on your plan. To change them, write to your RE by PX account manager.</p>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2">
              {(Object.keys(MODULES) as ModuleKey[]).map((m) => (
                <li key={m} className="flex items-center gap-2 text-[13px]">
                  {modules[m] ? <CheckCircle2 className="size-4 text-success" aria-hidden="true" /> : <Lock className="size-4 text-subtle" aria-hidden="true" />}
                  <span className={modules[m] ? 'text-foreground' : 'text-muted'}>{MODULES[m]}</span>
                  <span className="sr-only">{modules[m] ? 'included' : 'not included'}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <BillingProfileForm orgId={org.id} initial={{ legalName: bp?.legal_name ?? '', gstin: bp?.gstin ?? '', stateCode: bp?.state_code ?? '', billingAddress: bp?.billing_address ?? '' }} />
      </div>
    </PageShell>
  )
}
