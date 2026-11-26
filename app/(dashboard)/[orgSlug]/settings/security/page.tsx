// app/(dashboard)/[orgSlug]/settings/security/page.tsx — You → Sign-in & security: password, two-step verification,
// other devices. Only the signed-in person's own account.
import type { Metadata } from 'next'
import Link from 'next/link'
import { ShieldCheck, ShieldAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { SettingsCard, SettingsHeader } from '@/components/settings/SettingsSection'
import { ChangePasswordForm, RequireTwoStep, SignOutOthers, TwoStepOff } from '@/components/settings/SecurityPanels'
import { getWorkspaceSettings } from '@/lib/dal/workspace-settings'

export const metadata: Metadata = { title: 'Sign-in & security · Settings' }
export const dynamic = 'force-dynamic'

export default async function SecuritySettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params
  const { user, org, isAdmin } = await getVerifiedWorkspace(orgSlug)
  const { security } = await getWorkspaceSettings(org.id)
  const supabase = await createClient()
  const { data: factors } = await supabase.auth.mfa.listFactors()
  const mfaOn = (factors?.totp ?? []).some((f) => f.status === 'verified')
  return (
    <div className="max-w-3xl space-y-4">
      <SettingsHeader title="Sign-in & security" scope="you" description="Keep your account safe." />
      <SettingsCard title="Two-step verification" description="A code from an authenticator app each time you sign in.">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-[13px] text-foreground">
            {mfaOn ? <ShieldCheck aria-hidden className="size-5 text-success" /> : <ShieldAlert aria-hidden className="size-5 text-warning" />}
            {mfaOn ? 'On — your account asks for an authenticator code.' : 'Off — anyone with your password can sign in.'}
          </p>
          {mfaOn && <TwoStepOff lockedByWorkspace={security.requireTwoStep} />}
          {!mfaOn && (
            <Link href={`/account/security?next=${encodeURIComponent(`/${orgSlug}/settings/security`)}`} className="btn-primary inline-flex min-h-10 items-center rounded-lg bg-brand px-4 text-[13px] font-medium text-brand-foreground hover:bg-brand-hover">
              Turn on
            </Link>
          )}
        </div>
      </SettingsCard>
      {isAdmin && (
        <SettingsCard title="Two-step verification for your team" description="Owners and admins: make every member use an authenticator app.">
          <RequireTwoStep orgId={org.id} initial={security.requireTwoStep} selfHasIt={mfaOn} />
        </SettingsCard>
      )}
      <SettingsCard title="Password" description={`For ${user.email}.`}>
        <ChangePasswordForm email={user.email ?? ''} />
      </SettingsCard>
      <SettingsCard title="Signed-in devices">
        <SignOutOthers />
      </SettingsCard>
    </div>
  )
}
