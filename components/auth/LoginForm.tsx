'use client'
// components/auth/LoginForm.tsx
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirectTo') ?? '/select-org'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.push(redirectTo)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 rounded-md bg-[var(--danger-bg)] border border-red-100 text-[13px] text-[var(--danger)]">
          {error}
        </div>
      )}

      <div className="space-y-1">
        <label htmlFor="email" className="block text-[13px] font-medium text-[var(--foreground)]">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2 text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-blue-100 transition-colors placeholder:text-[var(--foreground-subtle)]"
          placeholder="you@company.com"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="password" className="block text-[13px] font-medium text-[var(--foreground)]">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-blue-100 transition-colors placeholder:text-[var(--foreground-subtle)]"
          placeholder="••••••••"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 px-4 text-[13px] font-medium text-white bg-[var(--brand)] rounded-md hover:bg-[var(--brand-hover)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Signing in…' : 'Sign in'}
      </button>

      <p className="text-center text-[12px] text-[var(--foreground-muted)]">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="text-[var(--brand)] hover:underline font-medium">
          Create workspace
        </Link>
      </p>
    </form>
  )
}
