'use client'
// components/auth/LoginForm.tsx
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Shield, KeyRound, CheckCircle2, ArrowLeft, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { safeRedirectPath } from '@/lib/auth/safe-redirect'
import { appUrl } from '@/lib/site/urls'
import { PasswordInput } from '@/components/auth/PasswordInput'

export function LoginForm({ defaultRedirect }: { defaultRedirect?: string } = {}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = safeRedirectPath(searchParams.get('redirectTo'), defaultRedirect ? safeRedirectPath(defaultRedirect) : undefined)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Forgot password flow
  // ?mode=forgot (a reset link that expired or was used) opens "Forgot password" straight away.
  const [isForgotMode, setIsForgotMode] = useState(searchParams.get('mode') === 'forgot')
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
        // The address must be on Supabase's Redirect URLs allowlist (docs/operations/ENVIRONMENT.md). If the e-mail
        // template uses {{ .TokenHash }} instead, the link goes to /auth/confirm and works on any device.
        redirectTo: `${appUrl() ?? window.location.origin}/auth/callback?next=/reset-password`,
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
          <div className="p-3 rounded-md bg-[var(--danger-bg)] border border-danger/30 text-[13px] text-[var(--danger)]">
            {error}
          </div>
        )}

        {resetSuccess ? (
          <div className="p-4 rounded-xl bg-success-bg border border-success/30 text-success text-[13px] space-y-2">
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="w-4 h-4 text-success" />
              <span>Password Reset Email Sent</span>
            </div>
            <p className="text-[12px] text-success leading-relaxed">
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
                className="w-full px-3 py-2 text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-brand-light transition-colors"
                placeholder="you@company.com"
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 text-[13px] font-medium text-brand-foreground bg-[var(--brand)] rounded-md hover:bg-[var(--brand-hover)] disabled:opacity-60 transition-colors flex items-center justify-center gap-2 shadow-2xs"
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
      {searchParams.get('notice') === 'closed_saas' && (
        <div className="p-3.5 rounded-xl bg-brand-light border border-brand/30 text-brand text-[13px] flex items-start gap-2.5">
          <Shield className="w-4 h-4 text-brand mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold text-brand">Closed-SaaS Platform</div>
            <div className="text-[12px] text-brand mt-0.5 leading-relaxed">
              Public self-service registration is disabled. REGrow workspaces are provisioned by invitation or through our sales team. Please sign in to an existing account.
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-md bg-[var(--danger-bg)] border border-danger/30 text-[13px] text-[var(--danger)]">
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
          className="w-full px-3 py-2 text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-brand-light transition-colors placeholder:text-[var(--foreground-subtle)]"
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
        <PasswordInput
          id="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full h-11 px-4 text-[14px] font-semibold text-brand-foreground bg-brand rounded-lg hover:bg-brand-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-xs"
      >
        {loading ? 'Signing in…' : 'Sign in'}
      </button>

      {/* Accounts are created by invitation only; say so plainly for people looking for a sign-up link. */}
      <p className="flex items-start gap-2 border-t border-default pt-4 text-[12px] leading-relaxed text-muted">
        <Shield aria-hidden className="mt-0.5 size-3.5 flex-shrink-0 text-subtle" />
        <span>New here? Your company&apos;s admin adds you — look for the invitation email to set your password.</span>
      </p>
    </form>
  )
}
