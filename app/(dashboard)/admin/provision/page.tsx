// app/(dashboard)/admin/provision/page.tsx
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { PageShell } from '@/components/layout/PageShell'
import { PlatformProvisioningModal } from '@/components/admin/PlatformProvisioningModal'

export const metadata: Metadata = { title: 'Platform Provisioning' }
export const dynamic = 'force-dynamic'

export default async function PlatformProvisioningPage({ searchParams }: { searchParams: Promise<{ prospect?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login?redirectTo=/admin/provision')
  }

  // Authorize Platform Super Admin access
  const service = createServiceClient()
  const { data: platformUser } = await service
    .from('platform_users')
    .select('role, is_active')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (!platformUser || platformUser.role !== 'super_admin') {
    redirect('/select-org')
  }

  // Activating a demo request: start from what the person told us.
  const prospectId = (await searchParams).prospect
  let prefill: { prospectId: string; name: string; type: 'developer' | 'channel_partner'; adminEmail: string; adminName: string } | undefined
  if (prospectId && /^[0-9a-f-]{36}$/i.test(prospectId)) {
    const sales = service as unknown as { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
    const { data: p } = await sales.from('internal_prospects').select('id, company_name, org_type, contact_email, contact_name, linked_org_id').eq('id', prospectId).maybeSingle()
    if (p && !p.linked_org_id) {
      prefill = { prospectId: p.id, name: p.company_name, type: p.org_type === 'channel_partner' ? 'channel_partner' : 'developer', adminEmail: p.contact_email ?? '', adminName: p.contact_name ?? '' }
    }
  }

  return (
    <PageShell
      title="Platform Customer Onboarding"
      description="Authorised RE by PX workspace provisioning and subscription seat entitlement management"
    >
      <div className="py-6">
        <PlatformProvisioningModal prefill={prefill} />
      </div>
    </PageShell>
  )
}
