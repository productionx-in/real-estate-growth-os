// app/(auth)/reset-password/page.tsx — set a new password after following the reset email.
import type { Metadata } from 'next'
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm'
import { AuthFrame } from '@/components/auth/AuthFrame'

export const metadata: Metadata = { title: 'Set a new password' }
export const dynamic = 'force-dynamic'

export default function ResetPasswordPage() {
  return (
    <AuthFrame>
    <div className="ceramic !rounded-[28px] p-6 sm:p-9">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--foreground)]">Set a new password</h1>
        <p className="mt-1 text-sm text-[var(--foreground-muted)]">Choose a password you don’t use anywhere else.</p>
      </div>
      <ResetPasswordForm />
    </div>
    </AuthFrame>
  )
}
