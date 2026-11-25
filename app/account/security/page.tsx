// app/account/security/page.tsx — any signed-in person can turn on two-step verification for their own account.
// The first Platform Owner needs this: scripts/bootstrap-super-admin.mjs refuses an account without a verified
// authenticator, and the console's own setup screen is only reachable by people who are already staff.
// It changes nothing but the signed-in user's own authenticator; it grants no access.
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getConsoleAccess } from '@/lib/auth/platform'
import { safeRedirectPath } from '@/lib/auth/safe-redirect'
import { MfaGate } from '@/components/platform/MfaGate'
import { Card, CardContent } from '@/components/ui'

export const metadata: Metadata = { title: 'Two-step verification', robots: { index: false } }
export const dynamic = 'force-dynamic'

export default async function AccountSecurityPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  // Where the person came from (e.g. their workspace's security settings), so they can go straight back.
  const raw = (await searchParams).next
  const next = raw ? safeRedirectPath(raw, '') : ''
  const self = `/account/security${next ? `?next=${encodeURIComponent(next)}` : ''}`
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?redirectTo=${encodeURIComponent(self)}`)
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aal?.currentLevel !== 'aal2') {
    return <div className="min-h-dvh bg-background"><MfaGate intro="Protect your account with an authenticator app." /></div>
  }
  // Back where they came from; otherwise staff continue to the console and everyone else to their workspaces.
  const staff = !next && (await getConsoleAccess()).state === 'ok'
  const href = next || (staff ? '/platform' : '/select-org')
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-3 p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck aria-hidden className="size-5 text-success" />
            <h1 className="text-[16px] font-semibold">Two-step verification is on</h1>
          </div>
          <p className="text-[13px] text-muted">Signed in as {user.email}. Your authenticator app is verified for this account.</p>
          <Link href={href} className="btn-primary inline-flex min-h-10 items-center rounded-lg bg-brand px-4 text-[13px] font-medium text-brand-foreground hover:bg-brand-hover">
            {next ? 'Back to your settings' : staff ? 'Continue to the console' : 'Continue to your workspace'}
          </Link>
        </CardContent>
      </Card>
    </main>
  )
}
