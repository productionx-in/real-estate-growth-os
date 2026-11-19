// app/account/security/page.tsx — any signed-in person can turn on two-step verification for their own account.
// The first Platform Owner needs this: scripts/bootstrap-super-admin.mjs refuses an account without a verified
// authenticator, and the console's own setup screen is only reachable by people who are already staff.
// It changes nothing but the signed-in user's own authenticator; it grants no access.
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { MfaGate } from '@/components/platform/MfaGate'
import { Card, CardContent } from '@/components/ui'

export const metadata: Metadata = { title: 'Two-step verification', robots: { index: false } }
export const dynamic = 'force-dynamic'

export default async function AccountSecurityPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?redirectTo=/account/security')
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aal?.currentLevel !== 'aal2') {
    return <div className="min-h-dvh bg-background"><MfaGate intro="Protect your account with an authenticator app." /></div>
  }
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-3 p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck aria-hidden className="size-5 text-success" />
            <h1 className="text-[16px] font-semibold">Two-step verification is on</h1>
          </div>
          <p className="text-[13px] text-muted">Signed in as {user.email}. Your authenticator app is verified for this account.</p>
          <Link href="/select-org" className="text-[13px] font-medium text-brand hover:underline">Continue</Link>
        </CardContent>
      </Card>
    </main>
  )
}
