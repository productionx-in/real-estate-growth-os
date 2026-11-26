// app/(dashboard)/[orgSlug]/settings/notifications/page.tsx — You → My notifications: alerts on this device and the
// e-mails RE by PX sends you. Your own choices only.
import type { Metadata } from 'next'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { createClient } from '@/lib/supabase/server'
import { SettingsCard, SettingsHeader } from '@/components/settings/SettingsSection'
import { DailyReportToggle } from '@/components/account/DailyReportToggle'
import { PushAlertsToggle } from '@/components/notifications/PushAlertsToggle'
import { DeviceSoundToggle } from '@/components/notifications/DeviceSoundToggle'
import { AlertPreferences, WeeklyDigestToggle } from '@/components/notifications/AlertPreferences'
import { getWorkspaceSettings } from '@/lib/dal/workspace-settings'
import { personFromStored } from '@/lib/notifications/prefs'
import { isManagement } from '@/lib/auth/permissions'

export const metadata: Metadata = { title: 'My notifications · Settings' }
export const dynamic = 'force-dynamic'

export default async function NotificationSettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { user, org, role } = await getVerifiedWorkspace(orgSlug)
  const supabase = await createClient()
  const [{ data: profile }, settings] = await Promise.all([
    supabase.from('profiles').select('email_daily_report, email_weekly_digest, notification_prefs' as never).eq('auth_user_id', user.id).maybeSingle(),
    getWorkspaceSettings(org.id),
  ])
  const p = profile as { email_daily_report?: boolean; email_weekly_digest?: boolean; notification_prefs?: unknown } | null
  const dailyOn = p?.email_daily_report !== false
  return (
    <div className="max-w-3xl space-y-4">
      <SettingsHeader title="My notifications" scope="you" description="Choose how RE by PX reaches you." />
      <SettingsCard title="Alerts on this device" description="New leads and reminders as phone or desktop alerts, even when RE by PX is closed. Turn on for each device you use.">
        <PushAlertsToggle />
        <div className="mt-4 border-t border-default pt-4"><DeviceSoundToggle /></div>
      </SettingsCard>
      <SettingsCard title="Which alerts" description="Choose what reaches your devices. Everything always appears in your inbox in RE by PX.">
        <AlertPreferences initial={personFromStored(p?.notification_prefs)} team={settings.notifications} />
      </SettingsCard>
      <SettingsCard title="E-mail" description={`Sent to ${user.email}.`}>
        <div className="space-y-3">
          <DailyReportToggle initial={dailyOn} />
          {(isManagement(role)) && <WeeklyDigestToggle initial={p?.email_weekly_digest !== false} />}
          <p className="text-[12px] text-muted">E-mails about your account — invitations, sign-in and password links, and billing for owners and admins — are always sent.</p>
        </div>
      </SettingsCard>
    </div>
  )
}
