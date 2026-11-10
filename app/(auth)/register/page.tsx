// app/(auth)/register/page.tsx
import type { Metadata } from 'next'
import { RegisterForm } from '@/components/auth/RegisterForm'

export const metadata: Metadata = { title: 'Create Account' }

export default function RegisterPage() {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-8 shadow-sm">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--foreground)]">Create your workspace</h1>
        <p className="mt-1 text-sm text-[var(--foreground-muted)]">
          Set up your organisation and start managing leads
        </p>
      </div>
      <RegisterForm />
    </div>
  )
}
