
// app/(auth)/login/page.tsx
import type { Metadata } from 'next'
import { Suspense } from 'react'
import { LoginForm } from '@/components/auth/LoginForm'

export const metadata: Metadata = { title: 'Sign In' }

export default function LoginPage() {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-8 shadow-sm">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--foreground)]">
          Welcome back
        </h1>
        <p className="mt-1 text-sm text-[var(--foreground-muted)]">
          Sign in to your workspace
        </p>
      </div>

      <Suspense fallback={<div>Loading login...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  )
}
