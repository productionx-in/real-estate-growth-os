// app/(dashboard)/[orgSlug]/settings/alerts/page.tsx — Your team → Notification defaults (owners and admins):
//   * Lead alerts — new-lead alerts, "not contacted yet" reminders, follow-up reminders and their sounds (20260093).
//   * Alerts on devices — which alerts reach people's phones and computers unless they choose otherwise (20260076).
//   * Recent lead alerts — who was alerted about what, and whether the phone or desktop alert went out.
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getWorkspaceSettings } from '@/lib/dal/workspace-settings'
import { recentLeadAlerts } from '@/lib/dal/notifications'
import { SettingsCard, SettingsHeader } from '@/components/settings/SettingsSection'
import { TeamAlertDefaults } from '@/components/notifications/AlertPreferences'
import { LeadAlertSettingsForm } from '@/components/notifications/LeadAlertSettingsForm'

export const metadata: Metadata = { title: 'Notification defaults · Settings' }
export const dynamic = 'force-dynamic'

const KIND = { newLead: 'New lead', reminder: 'Not contacted', followUp: 'Follow-up', win: 'Achievement' } as const
const PUSH = { sent: 'Sent', skipped: 'Not sent', failed: 'Failed', none: 'In app only' } as const

export default async function AlertDefaultsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { org, isAdmin } = await getVerifiedWorkspace(orgSlug)
  if (!isAdmin) redirect(`/${orgSlug}/settings`)
  const [settings, log] = await Promise.all([getWorkspaceSettings(org.id), recentLeadAlerts(org.id)])
  const time = (iso: string) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
  return (
    <div className="max-w-3xl space-y-4">
      <SettingsHeader title="Notification defaults" scope="org" description="How your team hears about new leads and follow-ups. Each person can still change their own device alerts in My notifications." />
      <SettingsCard title="Lead alerts" description="Sent by REGrow’s server, so they arrive on time even when nobody has REGrow open — as a banner with a sound in the app, and as a phone or desktop alert where someone turned those on.">
        <LeadAlertSettingsForm orgId={org.id} initial={settings.alerts} />
      </SettingsCard>
      <SettingsCard title="Alerts on devices" description="Every alert always appears in the person’s inbox in REGrow; these switch the phone or desktop alert on or off.">
        <TeamAlertDefaults orgId={org.id} initial={settings.notifications} />
      </SettingsCard>
      <SettingsCard title="Recent lead alerts" description="The latest 40, newest first. “In app only” means the person has not turned on alerts on any device yet.">
        {log.length === 0 ? (
          <p className="text-[13px] text-muted">No lead alerts yet. They appear here as leads arrive.</p>
        ) : (
          <div className="-mx-1 overflow-x-auto">
            <table className="data-table w-full min-w-[560px] text-left text-[13px]">
              <thead className="text-[12px] text-muted">
                <tr><th className="px-1 py-2 font-medium">When</th><th className="px-1 py-2 font-medium">Alert</th><th className="px-1 py-2 font-medium">To</th><th className="px-1 py-2 font-medium">Device alert</th><th className="px-1 py-2 font-medium">Seen</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {log.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-1 py-2 text-muted">{time(r.when)}</td>
                    <td className="px-1 py-2"><span className="text-[11px] font-semibold uppercase tracking-wide text-subtle">{KIND[r.kind]}</span><br /><span className="text-foreground">{r.title}</span></td>
                    <td className="px-1 py-2">{r.recipient}</td>
                    <td className="px-1 py-2" title={r.push.detail ?? undefined}><span className={r.push.status === 'failed' ? 'text-danger' : r.push.status === 'sent' ? 'text-success' : 'text-muted'}>{PUSH[r.push.status]}</span></td>
                    <td className="px-1 py-2 text-muted">{r.read ? 'Yes' : 'Not yet'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SettingsCard>
    </div>
  )
}
