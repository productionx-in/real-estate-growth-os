// app/(dashboard)/[orgSlug]/settings/profile/page.tsx — You → Profile & preferences.
import type { Metadata } from 'next'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { ROLE_LABELS } from '@/lib/auth/permissions'
import { SettingsCard, SettingsHeader } from '@/components/settings/SettingsSection'
import { ProfileForm } from '@/components/settings/ProfileForm'
import { ProfilePhoto } from '@/components/settings/ProfilePhoto'
import { AppearancePicker } from '@/components/settings/AppearancePicker'
import type { MemberRole } from '@/types/database'

export const metadata: Metadata = { title: 'Profile · Settings' }
export const dynamic = 'force-dynamic'

export default async function ProfileSettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { user, profile, role } = await getVerifiedWorkspace(orgSlug)
  return (
    <div className="max-w-3xl space-y-4">
      <SettingsHeader title="Profile & preferences" scope="you" description="Your photo, name and phone, and how REGrow looks for you." />
      <SettingsCard title="Photo" description="📸 Add a photo so your team recognises you.">
        <ProfilePhoto name={profile?.full_name ?? ''} initialUrl={profile?.avatar_url ?? null} />
      </SettingsCard>
      <SettingsCard title="Profile" description="Your name and phone appear to your team, and on documents you share with buyers.">
        <ProfileForm initial={{ fullName: profile?.full_name ?? '', phone: profile?.phone ?? '' }} email={user.email ?? ''} roleLabel={ROLE_LABELS[role as MemberRole] ?? role} avatarUrl={profile?.avatar_url ?? null} />
      </SettingsCard>
      <SettingsCard title="Appearance" description="Saved in this browser.">
        <AppearancePicker />
      </SettingsCard>
    </div>
  )
}
