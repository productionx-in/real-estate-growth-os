// app/(dashboard)/admin/provision/page.tsx
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { PageShell } from '@/components/layout/PageShell'
import { PlatformProvisioningModal } from '@/components/admin/PlatformProvisioningModal'

export const metadata: Metadata = { title: 'Platform Provisioning' }
export const dynamic = 'force-dynamic'

export default async function PlatformProvisioningPage() {
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

  return (
    <PageShell
      title="Platform Customer Onboarding"
      description="Authorised REGrow workspace provisioning and subscription seat entitlement management"
    >
      <div className="py-6">
        <PlatformProvisioningModal />
      </div>
    </PageShell>
  )
}
