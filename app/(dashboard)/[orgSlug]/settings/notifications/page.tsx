// app/(dashboard)/[orgSlug]/settings/notifications/page.tsx — You → My notifications: alerts on this device and the
// e-mails REGrow sends you. Your own choices only.
import type { Metadata } from 'next'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { createClient } from '@/lib/supabase/server'
import { SettingsCard, SettingsHeader } from '@/components/settings/SettingsSection'
import { DailyReportToggle } from '@/components/account/DailyReportToggle'
import { PushAlertsToggle } from '@/components/notifications/PushAlertsToggle'

export const metadata: Metadata = { title: 'My notifications · Settings' }
export const dynamic = 'force-dynamic'

export default async function NotificationSettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { user } = await getVerifiedWorkspace(orgSlug)
  const supabase = await createClient()
  const { data: profile } = await supabase.from('profiles').select('email_daily_report' as never).eq('auth_user_id', user.id).maybeSingle()
  const dailyOn = (profile as { email_daily_report?: boolean } | null)?.email_daily_report !== false
  return (
    <div className="max-w-3xl space-y-4">
      <SettingsHeader title="My notifications" scope="you" description="Choose how REGrow reaches you." />
      <SettingsCard title="Alerts on this device" description="New leads and reminders as phone or desktop alerts, even when REGrow is closed. Turn on for each device you use.">
        <PushAlertsToggle />
      </SettingsCard>
      <SettingsCard title="E-mail" description={`Sent to ${user.email}.`}>
        <div className="space-y-3">
          <DailyReportToggle initial={dailyOn} />
          <p className="text-[12px] text-muted">E-mails about your account — invitations, sign-in and password links, and billing for owners and admins — are always sent.</p>
        </div>
      </SettingsCard>
    </div>
  )
}
