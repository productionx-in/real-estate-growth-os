// app/(dashboard)/[orgSlug]/calculators/page.tsx — sales calculators (cost sheet, loan EMI, affordability, area units)
// for everyone in the workspace, starting from the workspace's defaults (Settings → Calculators).
import type { Metadata } from 'next'
import Link from 'next/link'
import { PageShell } from '@/components/layout/PageShell'
import { Calculators } from '@/components/calculators/Calculators'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getWorkspaceSettings } from '@/lib/dal/workspace-settings'

export const metadata: Metadata = { title: 'Calculators' }

export default async function CalculatorsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { org, isAdmin } = await getVerifiedWorkspace(orgSlug)
  const settings = await getWorkspaceSettings(org.id)
  return (
    <PageShell title="Calculators" description="Cost sheet, home-loan EMI, what a buyer can afford, and area units — then send it on WhatsApp.">
      <Calculators defaults={settings.calculators} areaUnit={settings.inventory.areaUnitBuilt} />
      {isAdmin && <p className="mt-6 text-[12px] text-muted">Starting values (bank rate, GST, stamp duty, charges) come from <Link className="font-medium text-brand" href={`/${orgSlug}/settings/calculators`}>Settings → Calculators</Link>.</p>}
    </PageShell>
  )
}
