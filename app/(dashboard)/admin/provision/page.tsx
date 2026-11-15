// app/(dashboard)/admin/provision/page.tsx
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
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

  return (
    <PageShell
      title="Platform Customer Onboarding"
      description="Authorised Production X workspace provisioning and subscription seat entitlement management"
    >
      <div className="py-6">
        <PlatformProvisioningModal />
      </div>
    </PageShell>
  )
}
