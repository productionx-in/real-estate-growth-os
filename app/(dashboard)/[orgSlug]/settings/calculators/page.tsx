// app/(dashboard)/[orgSlug]/settings/calculators/page.tsx — the workspace's calculator defaults (org_settings.calculators,
// 20260111): bank rate, tenure, down payment, income share for EMIs, GST, stamp duty, registration and extra charges.
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getWorkspaceSettings } from '@/lib/dal/workspace-settings'
import { SettingsCard, SettingsHeader } from '@/components/settings/SettingsSection'
import { CalculatorSettingsForm } from '@/components/settings/CalculatorSettingsForm'

export const metadata: Metadata = { title: 'Calculators · Settings' }
export const dynamic = 'force-dynamic'

export default async function CalculatorSettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { org, isAdmin } = await getVerifiedWorkspace(orgSlug)
  if (!isAdmin) redirect(`/${orgSlug}/settings`)
  const settings = await getWorkspaceSettings(org.id)
  return (
    <div className="max-w-3xl space-y-4">
      <SettingsHeader title="Calculators" scope="org" description="The starting values your team's calculators use. Anyone can still change a number for a buyer." />
      <SettingsCard title="Loan, taxes and charges" description="Set these to match your projects and the banks you work with.">
        <CalculatorSettingsForm orgId={org.id} initial={settings.calculators} />
      </SettingsCard>
    </div>
  )
}
