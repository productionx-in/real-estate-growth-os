// app/(dashboard)/[orgSlug]/settings/whatsapp/page.tsx — Leads and forms → WhatsApp auto-replies (20260089): a welcome
// message on a buyer's first message and an away message outside business hours. Owners and admins.
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getWorkspaceSettings } from '@/lib/dal/workspace-settings'
import { createServiceClient } from '@/lib/supabase/server'
import { Alert } from '@/components/ui'
import { SettingsCard, SettingsHeader } from '@/components/settings/SettingsSection'
import { WhatsAppSettingsForm } from '@/components/settings/WhatsAppSettingsForm'

export const metadata: Metadata = { title: 'WhatsApp auto-replies · Settings' }
export const dynamic = 'force-dynamic'

export default async function WhatsAppSettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { org, isAdmin } = await getVerifiedWorkspace(orgSlug)
  if (!isAdmin) redirect(`/${orgSlug}/settings`)
  const [settings, { count }] = await Promise.all([
    getWorkspaceSettings(org.id),
    createServiceClient().from('integration_connections').select('id', { count: 'exact', head: true })
      .eq('org_id', org.id).eq('provider', 'whatsapp_cloud').eq('status', 'connected'),
  ])
  return (
    <div className="max-w-3xl space-y-4">
      <SettingsHeader title="WhatsApp auto-replies" scope="org" description="Answer every WhatsApp enquiry at once — even at night — while your team gets to it." />
      {!count && (
        <Alert tone="info" title="WhatsApp is not connected yet">
          You can set these up now; they start working once your number is connected in <Link className="font-medium underline" href={`/${orgSlug}/integrations`}>Integrations</Link>.
        </Alert>
      )}
      <SettingsCard title="Automatic replies">
        <WhatsAppSettingsForm orgId={org.id} initial={settings.whatsapp} />
      </SettingsCard>
    </div>
  )
}
