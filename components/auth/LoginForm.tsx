'use client'
// components/auth/LoginForm.tsx
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Shield, KeyRound, CheckCircle2, ArrowLeft, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirectTo') ?? '/select-org'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Forgot password flow
  const [isForgotMode, setIsForgotMode] = useState(false)
  const [resetSuccess, setResetSuccess] = useState(false)

  const supabase = createClient()

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password })

    if (signInErr) {
      setError(signInErr.message)
      setLoading(false)
      return
    }

    router.push(redirectTo)
    router.refresh()
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) {
      setError('Please enter your account email address.')
      return
    }

    setError(null)
    setLoading(true)

    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/settings`,
      })

      if (resetErr) {
        setError(resetErr.message)
      } else {
        setResetSuccess(true)
      }
    } catch {
      setError('Failed to send password reset request. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (isForgotMode) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <button
            type="button"
            onClick={() => {
              setIsForgotMode(false)
              setResetSuccess(false)
              setError(null)
            }}
            className="text-[12px] text-[var(--foreground-muted)] hover:text-[var(--foreground)] flex items-center gap-1 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Sign In</span>
          </button>
        </div>

        <div className="mb-4">
          <h2 className="text-[15px] font-bold text-[var(--foreground)]">Reset Password</h2>
          <p className="text-[12px] text-[var(--foreground-muted)] mt-0.5">
            Enter your email address and we will send a password reset link.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-md bg-[var(--danger-bg)] border border-red-100 text-[13px] text-[var(--danger)]">
            {error}
          </div>
        )}

        {resetSuccess ? (
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-[13px] space-y-2">
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Password Reset Email Sent</span>
            </div>
            <p className="text-[12px] text-emerald-700 leading-relaxed">
              If an active account exists for <strong>{email}</strong>, check your inbox for instructions to reset your password.
            </p>
          </div>
        ) : (
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="reset-email" className="block text-[13px] font-medium text-[var(--foreground)]">
                Email
              </label>
              <input
                id="reset-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-blue-100 transition-colors"
                placeholder="you@company.com"
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 text-[13px] font-medium text-white bg-[var(--brand)] rounded-md hover:bg-[var(--brand-hover)] disabled:opacity-60 transition-colors flex items-center justify-center gap-2 shadow-2xs"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              <span>{loading ? 'Sending Request…' : 'Send Reset Link'}</span>
            </button>
          </form>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={handleSignIn} className="space-y-4">
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
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="block text-[13px] font-medium text-[var(--foreground)]">
            Password
          </label>
          <button
            type="button"
            onClick={() => {
              setError(null)
              setIsForgotMode(true)
            }}
            className="text-[11px] text-[var(--brand)] hover:underline font-medium"
          >
            Forgot password?
          </button>
        </div>
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
        className="w-full py-2.5 px-4 text-[13px] font-medium text-white bg-[var(--brand)] rounded-md hover:bg-[var(--brand-hover)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-2xs"
      >
        {loading ? 'Signing in…' : 'Sign in'}
      </button>

      {/* Enterprise Organization-Controlled SaaS Notice */}
      <div className="pt-3 mt-4 border-t border-[var(--border)]">
        <div className="p-3 rounded-lg bg-gray-50 border border-gray-100 text-[11px] text-[var(--foreground-muted)] space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-gray-700">
            <Shield className="w-3.5 h-3.5 text-[var(--brand)]" />
            <span>Organisation-Controlled SaaS</span>
          </div>
          <p className="leading-relaxed">
            Public employee signup is not permitted. Workspace access is provisioned by your organisation administrator. If you were invited, check your email for your activation link.
          </p>
        </div>
      </div>
    </form>
  )
}
